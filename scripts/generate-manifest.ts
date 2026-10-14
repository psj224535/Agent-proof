import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(path=>path&&path!=='MANIFEST.sha256.json').sort();
const manifest=Object.fromEntries(files.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
writeFileSync('MANIFEST.sha256.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Wrote MANIFEST.sha256.json for '+files.length+' files.');
