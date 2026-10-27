import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const files=(await readdir(root)).filter(name=>/\.(m?js)$/.test(name));
for(const name of files){const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL(name,root))],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log(`Syntax checked ${files.length} application/build modules.`);
