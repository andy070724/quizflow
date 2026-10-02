import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const target=new URL('../server/.env',import.meta.url);
if(existsSync(target)){console.log('server/.env already exists; keeping your settings.');}
else{const template=readFileSync(new URL('../server/.env.example',import.meta.url),'utf8');writeFileSync(target,template.replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+randomBytes(32).toString('hex')),{mode:0o600});console.log('Created server/.env with a random secret and demo questions enabled.');}
console.log('Next: docker compose up -d db');
console.log('Then: npm run db:migrate && npm run dev');
