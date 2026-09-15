const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const actual=path.join(root,'probe','config','snmp-profiles.json');
const example=path.join(root,'probe','config','snmp-profiles.example.json');
try{
  const ex=JSON.parse(fs.readFileSync(example,'utf8'));
  let cur={profiles:{}};
  if(fs.existsSync(actual)) cur=JSON.parse(fs.readFileSync(actual,'utf8'));
  cur.profiles=cur.profiles||{};
  const added=[];
  for(const [name,profile] of Object.entries(ex.profiles||{})){
    if(!cur.profiles[name]){cur.profiles[name]=profile;added.push(name);}
  }
  fs.mkdirSync(path.dirname(actual),{recursive:true});
  fs.writeFileSync(actual,JSON.stringify(cur,null,2)+'\n','utf8');
  console.log(added.length?`Perfiles agregados sin alterar los existentes: ${added.join(', ')}`:'Perfiles SNMP existentes conservados; no hubo nada que agregar.');
}catch(e){console.error('No se pudieron actualizar los perfiles SNMP:',e.message);process.exit(1);}
