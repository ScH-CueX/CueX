export const DEMO_FPS = 30;
export const DEMO_TOTAL = 1350;
export const DEMO_SHOTS = [
  {id:'problem', from:0, duration:165, title:'背熟资料，也会接不住追问。', voice:'资料都背过了，可医生的追问，从不按准备稿来。'},
  {id:'enter', from:165, duration:195, title:'在对话压力里，练习临场应对。', voice:'Cue X，让医药代表在对话压力里，练习临场应对。'},
  {id:'interrupt', from:360, duration:240, title:'持续偏离，医生会追问。', voice:'持续偏离关切，医生会追问。快层判断时机，慢层提前准备。'},
  {id:'withdraw', from:600, duration:270, title:'自己补上答案，那句追问就放下了。', voice:'但当你主动补上答案，已经准备好的追问，就不必再说。'},
  {id:'review', from:870, duration:300, title:'回到关键时刻，换一种问法再练。', voice:'复盘回到刚才的关键时刻。减少提示，换一种问法，再练一次。'},
  {id:'brand', from:1170, duration:180, title:'让每一次临场应对，都有准备。', voice:'Cue X，让每一次临场应对，都有准备。'},
] as const;
export type DemoShotId = typeof DEMO_SHOTS[number]['id'];
