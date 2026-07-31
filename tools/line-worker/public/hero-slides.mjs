const root=document.querySelector('.hero-visual');
if(root){
  const sources=[
    '/hoshilu-search-agent-products-v1.webp',
    '/hoshilu-discovery-collage.webp',
    '/seo/hoshilu-category-guide-v1.png'
  ];
  const slides=sources.map((source,index)=>{
    const item=document.createElement('div');
    item.className=`hero-slide${index===0?' is-active':''}`;
    item.style.backgroundImage=`url("${source}")`;
    root.append(item);return item;
  });
  const dots=document.createElement('div');dots.className='hero-slide-dots';
  const marks=slides.map((_,index)=>{const mark=document.createElement('span');if(index===0)mark.className='is-active';dots.append(mark);return mark;});
  root.append(dots);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    let active=0;
    setInterval(()=>{slides[active].classList.remove('is-active');marks[active].classList.remove('is-active');active=(active+1)%slides.length;slides[active].classList.add('is-active');marks[active].classList.add('is-active');},5200);
  }
}

