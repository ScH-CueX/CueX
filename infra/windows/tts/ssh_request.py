"""One bounded request over SSH stdin; never executes input or accepts URLs."""
import base64
import json
import sys
import urllib.error
import urllib.request


def main():
    raw = sys.stdin.buffer.read(8193)
    if len(raw) > 8192:
        raise ValueError('request too large')
    message = json.loads(raw)
    route = message.get('path')
    if route == '/health':
        request = urllib.request.Request('http://127.0.0.1:18666/health')
    elif route == '/tts':
        body = message.get('body', {})
        text = body.get('text')
        voice = body.get('voice', 'doctor')
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= 500 or voice not in ('doctor', 'narrator'):
            raise ValueError('invalid speech request')
        request = urllib.request.Request('http://127.0.0.1:18666/tts',
            data=json.dumps({'text': text, 'voice': voice}).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST')
    else:
        raise ValueError('unsupported route')
    try:
        response = urllib.request.urlopen(request, timeout=120)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = response.read(12_000_001)
        if len(data) > 12_000_000:
            raise ValueError('response too large')
        headers = {key.lower(): value for key, value in response.headers.items()
                   if key.lower() in ('content-type', 'x-tts-model', 'x-synthesis-ms', 'x-queue-ms')}
        print(json.dumps({'status': response.status, 'headers': headers,
                          'body': base64.b64encode(data).decode('ascii')}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
