export const modelDescriptions={女:'成年女性',男:'成年男性'};
export const backgrounds={影棚:'浅色纯色影棚背景',街头:'城市街头'};
const tops={
  日常:['棉质T恤','短袖衬衫','针织上衣'],
  通勤:['衬衫','细针织衫','翻领上衣'],
  约会:['针织上衣','棉衬衫','圆领上衣'],
  正式:['正装衬衫','细针织衫','立领衬衫']
};
const outerwear={
  温和:{日常:['短夹克','针织开衫','工装外套'],通勤:['西装外套','针织开衫','短外套'],约会:['短外套','针织开衫','短夹克'],正式:['西装外套','短西装','长西装']},
  凉:{日常:['短大衣','风衣','厚针织开衫'],通勤:['西装外套','风衣','短大衣'],约会:['短大衣','风衣','羊毛夹克'],正式:['羊毛西装','长西装','短大衣']},
  冷:{日常:['棉服','羽绒服','羊毛大衣'],通勤:['羊毛大衣','厚风衣','短棉服'],约会:['羊毛大衣','短棉服','长大衣'],正式:['羊毛大衣','长大衣','双排扣大衣']}
};
const bottoms={
  女:{日常:['直筒长裤','半身裙','阔腿裤'],通勤:['直筒西裤','及膝裙','锥形长裤'],约会:['半身长裙','阔腿裤','直筒长裙'],正式:['西装长裤','直筒长裙','阔腿西裤']},
  男:{日常:['直筒长裤','工装裤','阔腿裤'],通勤:['直筒西裤','锥形长裤','羊毛西裤'],约会:['棉长裤','直筒西裤','阔腿裤'],正式:['西装长裤','直筒西裤','羊毛西裤']}
};
export function clothingFor(options,index){
  const {weather,occasion,model}=options;
  const outer=weather==='热'?null:outerwear[weather][occasion][index];
  const inner=weather==='冷'?['高领针织衫','羊毛衫','厚针织衫'][index]:tops[occasion][index];
  let bottom=bottoms[model][occasion][index];
  if(weather==='热'&&occasion==='日常'&&index===0)bottom=model==='女'?'直筒短裤':'休闲短裤';
  if(weather==='冷'&&bottom.includes('裙'))bottom='羊毛长裙';
  if(weather==='热')bottom=bottom.replace('羊毛','薄款');
  return {outer,top:inner,bottom};
}
export function accessoryFor(category,options,index){
  const {weather,occasion,model}=options;
  const formal=occasion==='正式'||occasion==='通勤';
  const names={
    帽子:weather==='热'?'草帽':weather==='冷'?'毛线帽':formal?'礼帽':'贝雷帽',
    发饰:model==='女'?'发夹':'发带',
    墨镜:'墨镜',
    围巾:weather==='冷'?'羊毛围巾':weather==='热'?'丝巾':'薄围巾',
    首饰:index===0?'项链':index===1?'手链':'戒指',
    腰带:formal?'细腰带':'皮带',
    包:model==='男'?['斜挎包','托特包','手提包'][index]:['手袋','托特包','斜挎包'][index],
    手套:weather==='冷'?'羊毛手套':'薄手套',
    袜子:weather==='冷'?'羊毛袜':'短袜',
    鞋:weather==='冷'?['短靴','系带皮靴','切尔西靴'][index]:weather==='热'&&!formal?['凉鞋','帆布鞋','平底凉鞋'][index]:formal?['乐福鞋','系带皮鞋',model==='女'?'低跟鞋':'德比鞋'][index]:['平底鞋','运动鞋','乐福鞋'][index],
    配饰:'饰品',
    其他:'饰品'
  };
  return names[category]||'饰品';
}
