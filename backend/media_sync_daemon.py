"""
Omega Media Sync Daemon (Unified aiohttp Pipeline)
Serves WebSockets on /ws and HTTP streaming on /stream
"""
import asyncio
import json
import sqlite3
import hashlib
import time
import os
import aiohttp
from aiohttp import web
from pathlib import Path

# Config
PORT = 5002
DB_PATH = os.path.expanduser('~/.veritas/media_state.db')
CONFIG_PATH = Path(os.path.expanduser('~/AppData/Roaming/omega-audio-player/omega_audio_library.json'))

connected_clients = set()

# ══════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════

def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS media_state (
            track_id TEXT PRIMARY KEY,
            position_ms INTEGER DEFAULT 0,
            is_paused INTEGER DEFAULT 1,
            updated_at INTEGER DEFAULT 0,
            title TEXT,
            artist TEXT
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS session_ledger (
            id TEXT PRIMARY KEY,
            track_id TEXT,
            track_title TEXT,
            start_position_ms INTEGER,
            end_position_ms INTEGER,
            total_listened_ms INTEGER,
            device TEXT,
            started_at INTEGER,
            ended_at INTEGER,
            seal TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    ''')
    conn.commit()
    conn.close()

def save_position(track_id, position_ms, is_paused):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        INSERT INTO media_state (track_id, position_ms, is_paused, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(track_id) DO UPDATE SET
            position_ms = excluded.position_ms,
            is_paused = excluded.is_paused,
            updated_at = excluded.updated_at
    ''', (track_id, position_ms, 1 if is_paused else 0, int(time.time() * 1000)))
    conn.commit()
    conn.close()

def get_position(track_id):
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        'SELECT position_ms, is_paused, updated_at FROM media_state WHERE track_id = ?',
        (track_id,)
    ).fetchone()
    conn.close()
    if row:
        return {'position_ms': row[0], 'is_paused': bool(row[1]), 'updated_at': row[2]}
    return {'position_ms': 0, 'is_paused': True, 'updated_at': 0}

def get_library_json():
    """Reads the JSON directly written by the Desktop Electron Player."""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, 'r', encoding='utf8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[SYNC] Failed to read database: {e}")
    return {"albums": []}

def get_track_path(track_id):
    data = get_library_json()
    for album in data.get('albums', []):
        for track in album.get('tracks', []):
            # Fallback to computing deterministic ID if missing
            computed_id = track.get('id')
            if not computed_id and track.get('path'):
                computed_id = hashlib.sha256(track.get('path').encode('utf-8')).hexdigest()[:16]
                
            if computed_id == track_id or track.get('filename') == track_id:
                return track.get('path')
    return None

def get_cover_path(album_id):
    data = get_library_json()
    for album in data.get('albums', []):
        if album.get('id') == album_id:
            cover_art = album.get('coverArt')
            # It might look like file:///... or an absolute path
            if cover_art:
                if cover_art.startswith('file:///'):
                    return Path(cover_art.replace('file:///', ''))
                return Path(cover_art)
    return None

def scan_grouped_library():
    """
    Returns the library grouped by Albums exactly as the app needs it.
    (Takes directly from desktop json config)
    """
    data = get_library_json()
    albums = data.get('albums', [])
    for album in albums:
        for track in album.get('tracks', []):
            # Inject deterministic ID if track lacks one
            if not track.get('id') and track.get('path'):
                track['id'] = hashlib.sha256(track.get('path').encode('utf-8')).hexdigest()[:16]
                
            state = get_position(track.get('id'))
            track['lastPositionMs'] = state.get('position_ms', 0)
            track['lastPlayedAt'] = state.get('updated_at', 0)
            track['isPaused'] = state.get('is_paused', True)
    return albums

# ══════════════════════════════════════════════════════════════
# HTTP ROUTES
# ══════════════════════════════════════════════════════════════

async def handle_library(request):
    """Serve structured Album JSON list"""
    return web.json_response({'albums': scan_grouped_library()})

async def handle_stream(request):
    """Serve native HTTP audio streaming (accepting Range headers)"""
    track_id = request.match_info.get('track_id')
    path_str = get_track_path(track_id)
    if not path_str or not Path(path_str).exists():
        return web.Response(status=404, text="Track not found")
    
    file_path = Path(path_str)
    file_size = file_path.stat().st_size
    response = web.StreamResponse()
    
    # Range headers for ExoPlayer/TrackPlayer
    range_header = request.headers.get('Range', '')
    if range_header:
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0])
        end = int(byte_range[1]) if len(byte_range) > 1 and byte_range[1] else file_size - 1
        response.set_status(206)
        response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response.headers['Content-Length'] = str(end - start + 1)
        response.headers['Accept-Ranges'] = 'bytes'
        response.content_type = 'audio/mpeg'
        await response.prepare(request)
        
        with open(file_path, 'rb') as f:
            f.seek(start)
            chunk_size = 8192
            bytes_left = end - start + 1
            try:
                while bytes_left > 0:
                    data = f.read(min(chunk_size, bytes_left))
                    if not data:
                        break
                    await response.write(data)
                    bytes_left -= len(data)
            except Exception as e:
                # Client disconnected (e.g. user scrubbed or skipped)
                pass
                
    else:
        response.set_status(200)
        response.headers['Content-Length'] = str(file_size)
        response.headers['Accept-Ranges'] = 'bytes'
        response.content_type = 'audio/mpeg'
        await response.prepare(request)
        
        try:
            with open(file_path, 'rb') as f:
                chunk_size = 8192
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    await response.write(data)
        except Exception as e:
            # Client disconnected
            pass
            
    return response

async def handle_cover(request):
    """Serve Cover Art directly"""
    album_id = request.match_info.get('album_id')
    cover_path = get_cover_path(album_id)
    if not cover_path or not cover_path.exists():
        return web.Response(status=404)
    return web.FileResponse(cover_path)

# ══════════════════════════════════════════════════════════════
# HTTP TELEMETRY (React Native WebSocket Fallback)
# ══════════════════════════════════════════════════════════════

async def handle_sync_http(request):
    try:
        data = await request.json()
        cmd = data.get('type')

        if cmd == 'HEARTBEAT':
            return web.json_response({'type': 'HEARTBEAT_ACK', 'ts': data.get('ts')})
            
        elif cmd == 'WAKE_SYNC_REQUEST':
            tid = data.get('track_id')
            if tid:
                state = get_position(tid)
                return web.json_response({
                    'type': 'WAKE_SYNC_RESPONSE',
                    'track_id': tid,
                    'position_ms': state.get('position_ms', 0)
                })

        elif cmd == 'PLAYHEAD_UPDATE':
            tid = data.get('track_id')
            pos = data.get('position_ms')
            isp = data.get('is_paused')
            if tid and pos is not None:
                save_position(tid, pos, isp)
                # Broadcast out to Electron Hub if applicable over ws
                await bcast({
                    'type': 'SYNC_UPDATE_BCAST',
                    'track_id': tid,
                    'position_ms': pos,
                    'is_paused': isp
                })
            return web.json_response({'type': 'ACK'})

        return web.json_response({'status': 'ignored'})
    except Exception as e:
        return web.Response(status=400, text=str(e))

# ══════════════════════════════════════════════════════════════
# WEBSOCKET TELEMETRY
# ══════════════════════════════════════════════════════════════

async def bcast(msg):
    for ws in set(connected_clients):
        if not ws.closed:
            try:
                await ws.send_str(json.dumps(msg))
            except:
                pass

async def handle_ws(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_clients.add(ws)
    print(f'[SYNC] Mobile node authenticating...')
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                data = json.loads(msg.data)
                cmd = data.get('type')
                
                if cmd == 'HEARTBEAT':
                    await ws.send_str(json.dumps({'type': 'HEARTBEAT_ACK', 'ts': data.get('ts')}))
                    
                elif cmd == 'WAKE_SYNC_REQUEST':
                    pass # Legacy. State is now bundled directly through /library via HTTP.

                elif cmd == 'PLAYHEAD_UPDATE':
                    # Extremely fast state injection directly into DB without blocking reads
                    tid = data.get('track_id')
                    pos = data.get('position_ms')
                    isp = data.get('is_paused')
                    if tid and pos is not None:
                        save_position(tid, pos, isp)
                        # Broadcast out to Electron Hub if applicable
                        await bcast({
                            'type': 'SYNC_UPDATE_BCAST',
                            'track_id': tid,
                            'position_ms': pos,
                            'is_paused': isp
                        })

    except Exception as e:
        pass
    finally:
        connected_clients.discard(ws)
        print(f'[SYNC] Mobile node detached.')
    return ws


# ══════════════════════════════════════════════════════════════
# MAIN RUNNER
# ══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    init_db()
    app = web.Application()
    app.router.add_get('/ws', handle_ws)
    app.router.add_get('/library', handle_library)
    app.router.add_get('/stream/{track_id}', handle_stream)
    app.router.add_get('/cover/{album_id}', handle_cover)
    app.router.add_post('/api/sync', handle_sync_http)
    
    print(f"[SYNC] Launching unified aiohttp telemetry node on port {PORT}")
    web.run_app(app, host='0.0.0.0', port=PORT, print=None)
