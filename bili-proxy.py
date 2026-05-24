"""B站音频代理 — 萌豚挑战
启动: python3 bili-proxy.py
前端配置: BILI_WORKER_URL = 'http://localhost:8765'
"""
import asyncio
from flask import Flask, request, jsonify
from bilibili_api import search, video, sync

app = Flask(__name__)

@app.route('/search')
def bili_search():
    q = request.args.get('q', '')
    if not q:
        return jsonify({'error': 'missing q'}), 400
    try:
        result = sync(search.search_by_type(q, search_type=search.SearchObjectType.VIDEO, page=1))
        items = result.get('result', [])
        results = []
        for r in items[:10]:
            dur = 0
            if r.get('duration'):
                parts = r['duration'].split(':')
                dur = int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 0
            results.append({
                'bvid': r.get('bvid', ''),
                'title': r.get('title', '').replace('<em class="keyword">', '').replace('</em>', ''),
                'author': r.get('author', ''),
                'play': r.get('play', 0),
                'duration': dur,
                'cover': r.get('pic', '')
            })
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/audio')
def bili_audio():
    bvid = request.args.get('bvid', '')
    if not bvid:
        return jsonify({'error': 'missing bvid'}), 400
    try:
        v = video.Video(bvid=bvid)
        info = sync(v.get_info())
        cid = info.get('cid', 0)
        duration = info.get('duration', 0)

        download_data = sync(v.get_download_url(cid=cid))
        detecter = video.VideoDownloadURLDataDetecter(download_data)
        streams = detecter.detect_best_streams(
            video_max_quality=video.VideoQuality._360P,
            audio_max_quality=video.AudioQuality._192K,
            no_dolby_audio=True,
            no_hires=True
        )
        audio_streams = [s for s in streams if isinstance(s, video.AudioStreamDownloadURL)]
        if not audio_streams:
            return jsonify({'error': 'no audio stream'}), 404

        best = max(audio_streams, key=lambda s: s.audio_quality.value)
        return jsonify({
            'url': best.url,
            'backupUrl': None,
            'duration': duration,
            'audioQuality': best.audio_quality.value
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ping')
def ping():
    return jsonify({'ok': True})

if __name__ == '__main__':
    print('B站代理启动: http://localhost:8765')
    app.run(host='0.0.0.0', port=8765, debug=False)
