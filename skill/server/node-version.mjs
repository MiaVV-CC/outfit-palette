export function requireNode(){
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major>=22||(major===21&&minor>=2)||(major===20&&minor>=11))return true;
  console.error('需要 Node.js 20.11 或更新版本。');
  process.exit(1);
}
