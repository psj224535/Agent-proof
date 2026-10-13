import {readFileSync} from 'node:fs';import {join} from 'node:path';
try{console.log(readFileSync(join(process.env.STATE_DIR??'.state','verifier','admin-token'),'utf8').trim());}catch{console.error('Start the local demo first: npm start');process.exitCode=1;}
