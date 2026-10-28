#!/usr/bin/env python3
"""Musafir Cafe local Wi-Fi server. Uses only Python's standard library."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import json, os, socket, subprocess, re, time

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'local-data'
DATA.mkdir(exist_ok=True)
SHOP_FILE = DATA / 'shop.json'
ORDERS_FILE = DATA / 'orders.json'
RATINGS_FILE = DATA / 'ratings.json'
PORT = int(os.environ.get('PORT', '8080'))
for f, default in ((ORDERS_FILE, []), (RATINGS_FILE, [])):
    if not f.exists(): f.write_text(json.dumps(default), encoding='utf-8')

def read_json(path, default):
    try:
        if not path.exists(): return default
        txt = path.read_text(encoding='utf-8-sig')
        return json.loads(txt) if txt.strip() else default
    except Exception: return default

def write_json(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)

def lan_ip():
    # Android's local Wi-Fi/hotspot interface is usually wlan0/softap; do not pick mobile-data rmnet interfaces.
    try:
        out = subprocess.check_output(['ip', '-4', '-o', 'addr', 'show'], stderr=subprocess.DEVNULL, text=True, timeout=2)
        rows=[]
        for line in out.splitlines():
            m=re.search(r'\d+:\s+([^\s]+).*?inet\s+(\d+\.\d+\.\d+\.\d+)', line)
            if not m: continue
            iface, ip=m.group(1),m.group(2)
            if iface == 'lo' or ip.startswith(('127.','169.254.')) or iface.startswith(('rmnet','ccmni','pdp','wwan','tun','docker','veth')): continue
            score=0
            if re.search(r'wlan|wifi|softap|ap\d|eth|en\w|br-',iface,re.I): score+=10
            if ip.startswith(('192.168.','10.','172.')): score+=2
            rows.append((score,ip))
        if rows: return sorted(rows,reverse=True)[0][1]
    except Exception: pass
    try:
        # UDP connect only selects an interface; it does not require actual Internet connectivity.
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('192.0.2.1',80)); ip=s.getsockname()[0]; s.close()
        if ip and not ip.startswith('127.'): return ip
    except Exception: pass
    try:
        infos=socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET,socket.SOCK_STREAM)
        for info in infos:
            ip=info[4][0]
            if not ip.startswith(('127.','169.254.')): return ip
    except Exception: pass
    return '127.0.0.1'

def json_bytes(obj): return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
def as_list(value): return value if isinstance(value,list) else []

class Handler(BaseHTTPRequestHandler):
    server_version = 'MusafirLocal/1.0'
    def log_message(self, fmt, *args):
        # Compact log: requests remain visible in the terminal for troubleshooting.
        print('[%s] %s' % (time.strftime('%H:%M:%S'), fmt % args))
    def send_data(self, status, body=b'', ctype='application/json; charset=utf-8', extra=None):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control','no-store')
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        if extra:
            for k,v in extra.items(): self.send_header(k,str(v))
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        if body and self.command != 'HEAD': self.wfile.write(body)
    def reply_json(self,obj,status=200): self.send_data(status,json_bytes(obj))
    def read_body(self):
        try: n=int(self.headers.get('Content-Length','0'))
        except ValueError: n=0
        if n<0 or n>15_000_000: raise ValueError('body too large')
        raw=self.rfile.read(n) if n else b''
        return json.loads(raw.decode('utf-8-sig')) if raw else {}
    def do_OPTIONS(self): self.send_data(204)
    def do_HEAD(self): self.do_GET()
    def do_GET(self):
        u=urlparse(self.path); p=unquote(u.path)
        if p == '/api/health': return self.reply_json({'ok':True,'time':int(time.time()*1000),'url':f'http://{lan_ip()}:{PORT}'})
        if p == '/api/info':
            ip=lan_ip()
            return self.reply_json({'ok':True,'host':ip,'port':PORT,'url':f'http://{ip}:{PORT}','orderUrl':f'http://{ip}:{PORT}/order.html'})
        if p == '/api/shop': return self.reply_json(read_json(SHOP_FILE,{}))
        if p == '/api/orders':
            arr=as_list(read_json(ORDERS_FILE,[])); q=parse_qs(u.query)
            if q.get('uid'): arr=[x for x in arr if x.get('uid')==q['uid'][0]]
            arr.sort(key=lambda x:float(x.get('t') or 0),reverse=True)
            return self.reply_json(arr)
        m=re.fullmatch(r'/api/orders/([^/]+)',p)
        if m:
            oid=m.group(1); o=next((x for x in as_list(read_json(ORDERS_FILE,[])) if x.get('id')==oid),None)
            return self.reply_json(o if o else {'error':'not found'},200 if o else 404)
        if p == '/api/ratings': return self.reply_json(sorted(as_list(read_json(RATINGS_FILE,[])),key=lambda x:float(x.get('t') or 0),reverse=True))
        if p == '/': p='/index.html'
        # Restrict static files to this project directory.
        candidate=(ROOT / p.lstrip('/')).resolve()
        try: candidate.relative_to(ROOT.resolve())
        except ValueError: return self.reply_json({'error':'forbidden'},400)
        if not candidate.is_file(): return self.reply_json({'error':'not found'},404)
        types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'}
        data=candidate.read_bytes(); ctype=types.get(candidate.suffix.lower(),'application/octet-stream')
        rng=self.headers.get('Range')
        if rng and rng.startswith('bytes='):
            try:
                spec=rng[6:].split(',',1)[0]; a,b=spec.split('-',1)
                if a: start=int(a); end=int(b) if b else len(data)-1
                else: start=max(0,len(data)-int(b)); end=len(data)-1
                if start>=len(data) or end<start: raise ValueError()
                end=min(end,len(data)-1); part=data[start:end+1]
                return self.send_data(206,part,ctype,{'Content-Range':f'bytes {start}-{end}/{len(data)}','Accept-Ranges':'bytes'})
            except Exception: return self.send_data(416,b'',ctype,{'Content-Range':f'bytes */{len(data)}'})
        return self.send_data(200,data,ctype,{'Accept-Ranges':'bytes'})
    def do_POST(self):
        u=urlparse(self.path); p=unquote(u.path)
        try: body=self.read_body()
        except Exception as e: return self.reply_json({'error':str(e)},400)
        if p == '/api/shop':
            if not isinstance(body,dict): return self.reply_json({'error':'invalid shop data'},400)
            write_json(SHOP_FILE,body); return self.reply_json({'ok':True})
        if p == '/api/orders':
            if not isinstance(body,dict) or not body.get('id'): return self.reply_json({'error':'missing order id'},400)
            arr=as_list(read_json(ORDERS_FILE,[])); oid=str(body['id'])
            old=next((x for x in arr if x.get('id')==oid),None)
            if old:
                # Idempotent retry: keep already stored data rather than making a duplicate.
                return self.reply_json({'ok':True,'order':old},200)
            body['id']=oid; body.setdefault('localRev',1); body.setdefault('cloudRev',0); body.setdefault('t',int(time.time()*1000))
            arr.append(body); write_json(ORDERS_FILE,arr); return self.reply_json({'ok':True,'order':body},201)
        m=re.fullmatch(r'/api/orders/([^/]+)',p)
        if m:
            oid=m.group(1); arr=as_list(read_json(ORDERS_FILE,[])); found=False
            for o in arr:
                if str(o.get('id'))!=oid: continue
                found=True
                changed=False
                for k,v in (body.items() if isinstance(body,dict) else []):
                    if k not in ('cloudRev','localRev') and o.get(k)!=v: o[k]=v; changed=True
                    elif k=='cloudRev': o[k]=int(v or 0)
                    elif k=='localRev': o[k]=int(v or 1)
                if changed: o['localRev']=int(o.get('localRev') or 1)+1
                break
            if not found: return self.reply_json({'error':'not found'},404)
            write_json(ORDERS_FILE,arr); return self.reply_json(next(x for x in arr if str(x.get('id'))==oid))
        if p == '/api/ratings':
            if not isinstance(body,dict) or not body.get('id'): return self.reply_json({'error':'missing rating id'},400)
            rid=str(body['id']); arr=as_list(read_json(RATINGS_FILE,[])); old=next((x for x in arr if str(x.get('id'))==rid),None)
            if old:
                # Sync acknowledgement only updates the sync marker, preserving the rating itself.
                changed=False
                for k,v in body.items():
                    if k=='cloudRev': old[k]=int(v or 0)
                    elif k in ('localRev','id'): old[k]=v
                    elif old.get(k)!=v: old[k]=v; changed=True
                if changed: old['localRev']=int(old.get('localRev') or 1)+1
                item=old
            else:
                body.setdefault('localRev',1);body.setdefault('cloudRev',0);body.setdefault('t',int(time.time()*1000));arr.append(body);item=body
            write_json(RATINGS_FILE,arr);return self.reply_json({'ok':True,'rating':item},201)
        return self.reply_json({'error':'not found'},404)

class Server(ThreadingHTTPServer):
    allow_reuse_address=True
    daemon_threads=True

if __name__=='__main__':
    server=Server(('0.0.0.0',PORT),Handler)
    ip=lan_ip()
    print('\nMusafir Cafe Local Server')
    print(f'POS (same device): http://localhost:{PORT}/index.html')
    print(f'Customer QR URL:   http://{ip}:{PORT}/order.html')
    print(f'LAN IP:            {ip}')
    print('Keep this app/terminal running. Stop with Ctrl+C.\n')
    try: server.serve_forever(poll_interval=0.4)
    except KeyboardInterrupt: print('\nServer stopped.')
    finally: server.server_close()
