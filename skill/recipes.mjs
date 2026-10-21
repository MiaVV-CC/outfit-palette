import {generateRecipes} from './web/lib/recipes.mjs';
let source='';
for await(const chunk of process.stdin)source+=chunk;
try{
  process.stdout.write(JSON.stringify(generateRecipes(JSON.parse(source)),null,2)+'\n');
}catch(error){
  process.stderr.write(error.message+'\n');process.exitCode=1;
}
