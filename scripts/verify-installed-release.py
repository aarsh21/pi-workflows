#!/usr/bin/env python3
"""Verify native Pi installation and setup from the published v0.2.3 tag."""
import os,pathlib,tempfile,subprocess,json,hashlib,threading,queue,datetime
root=pathlib.Path(__file__).resolve().parent.parent
source='git:github.com/aarsh21/pi-workflows@v0.2.3'
expected=subprocess.check_output(['git','rev-parse','v0.2.3^{}'],cwd=root,text=True).strip()
with tempfile.TemporaryDirectory(prefix='pi-workflows-published-') as directory:
 env=os.environ.copy(); env['PI_CODING_AGENT_DIR']=directory
 installed=subprocess.run(['pi','install',source],cwd=directory,env=env,capture_output=True,text=True,timeout=180)
 assert installed.returncode==0,installed.stdout+installed.stderr
 entries=list(pathlib.Path(directory).glob('git/**/extensions/pstack/index.ts'))
 assert len(entries)==1,entries
 package_root=entries[0].parents[2]
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=package_root,text=True).strip()
 assert sha==expected,(sha,expected)
 assert json.loads((package_root/'package.json').read_text())['version']=='0.2.3'
 matched={}
 for p in (root/'extensions/pstack').glob('*.ts'):
  path=p.relative_to(root)
  local=hashlib.sha256(p.read_bytes()).hexdigest()
  assert local==hashlib.sha256((package_root/path).read_bytes()).hexdigest(),path
  matched[str(path)]=local
 proc=subprocess.Popen(['pi','--mode','rpc','--no-session'],cwd=directory,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 records=queue.Queue();trace=[]
 threading.Thread(target=lambda:[records.put(line) for line in proc.stdout],daemon=True).start()
 def send(value):proc.stdin.write(json.dumps(value)+'\n');proc.stdin.flush()
 send({'id':'commands','type':'get_commands'})
 commands=None;step=0
 try:
  while True:
   record=json.loads(records.get(timeout=35));trace.append(record)
   if record.get('type')=='response' and record.get('id')=='commands':
    assert record['success'],record
    commands=record['data']['commands']
    assert {'setup-pstack','pstack','pstack-check'}<={c['name'] for c in commands},commands
    send({'id':'setup','type':'prompt','message':'/setup-pstack'})
   if record.get('type')=='extension_ui_request':
    method=record['method'];reply={'type':'extension_ui_response','id':record['id']}
    if method=='select':
     value=['small — medium reasoning','openai-codex/gpt-5.5','openai-codex/gpt-6.1-sol'][step];step+=1
     assert value in record['options'],record
     reply['value']=value;send(reply)
    elif method=='confirm':reply['confirmed']=True;send(reply)
    elif method=='notify':
     assert record.get('notifyType')!='error',record
     if 'Saved pstack' in record['message']:break
 finally:
  proc.stdin.close();proc.wait(timeout=10)
  errors=proc.stderr.read();assert proc.returncode==0,errors
  assert 'Failed to load extension' not in errors,errors
 config=json.loads((pathlib.Path(directory)/'pstack-config.json').read_text())
 assert config=={'version':1,'budget':'small','models':{'worker':'openai-codex/gpt-5.5','comment-reviewer':'openai-codex/gpt-6.1-sol'}},config
 report={'passed':True,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'installSource':source,'publishedCommit':sha,'installationOutput':installed.stdout,'matchedInstalledExtensionSha256':matched,'config':config,'scope':'Actual pi install from published GitHub tag; native package discovery (no explicit extension path), real RPC setup dialogs and live T3 catalog. Extension bytes match release-tested code. No extra paid children in this installation smoke test.','commands':commands,'trace':trace}
 output=root/'evidence/v0.2.3-installed.json';output.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'passed':True,'publishedCommit':sha,'evidence':str(output)},indent=2))
