import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const folder=path.dirname(fileURLToPath(import.meta.url));
const files=fs.readdirSync(folder).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>path.join(folder,name));
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{stdio:'inherit'});
process.exit(result.status??1);
