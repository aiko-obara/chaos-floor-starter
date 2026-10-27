import { roomReferences } from './references.js';

export class Viewer {
  constructor({document,renderer,editable=true}) {
    this.document=document;this.renderer=renderer;this.editable=editable;this.studioOpen=false;this.references=[];this.index=0;this.previousFocus=null;
    this.$=(id)=>document.getElementById(id);
    if(editable){
      this.$('studio-panel').hidden=true;
      this.$('open-studio').addEventListener('click',()=>this.setStudioOpen(!this.studioOpen));
      this.$('close-studio').addEventListener('click',()=>this.setStudioOpen(false));
    }
    this.$('reference-panel').hidden=true;
    this.$('close-reference').addEventListener('click',()=>this.closeReference());
    this.document.addEventListener('keydown',(event)=>{
      if(event.key==='Escape'){
        if(!this.$('reference-panel').hidden){event.preventDefault();this.closeReference();}
        else if(this.studioOpen){event.preventDefault();this.setStudioOpen(false);}
      }
    });
    this.$('world-canvas').addEventListener('keydown',(event)=>{
      if(event.key==='Enter'&&!this.studioOpen){event.preventDefault();this.openReference(this.renderer.getSelection());}
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
        event.preventDefault();const rooms=this.renderer.getPlacements();
        if(!rooms.length)return;
        const current=rooms.findIndex((r)=>r.address===this.renderer.getSelection().address);
        const direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
        this.renderer.selectAddress(rooms[(current+direction+rooms.length)%rooms.length].address);
      }
    });
  }
  setStudioOpen(open) {
    if(!this.editable)return;
    this.studioOpen=!!open;this.closeReference(false);
    this.$('studio-panel').hidden=!this.studioOpen;
    this.$('open-studio').hidden=this.studioOpen;
    this.$('open-studio').setAttribute('aria-expanded',String(this.studioOpen));
    this.document.body.classList.toggle('editing',this.studioOpen);
    (this.studioOpen?this.$('close-studio'):this.$('world-canvas')).focus();
  }
  activate(selection) {
    if(this.studioOpen)return;
    if(selection?.occupied)this.openReference(selection);
    else this.closeReference(false);
  }
  openReference(selection) {
    if(!selection?.occupied||!selection.room)return;
    this.previousFocus=this.document.activeElement;
    this.references=roomReferences(selection.room);this.index=0;
    const panel=this.$('reference-panel');
    panel.setAttribute('aria-label',`${selection.address} ${selection.room.title}の参考画像`);
    this.$('reference-address').textContent=selection.address;
    this.$('reference-title').textContent=selection.room.title;
    const strip=this.$('reference-thumbnails');strip.replaceChildren();strip.hidden=this.references.length<2;
    this.references.forEach((ref,index)=>{
      const button=this.document.createElement('button');button.type='button';button.className='reference-thumbnail';
      button.setAttribute('aria-label',ref.title||`参考画像 ${index+1}`);button.setAttribute('aria-pressed',String(index===0));
      const img=this.document.createElement('img');img.src=ref.image;img.alt='';img.loading='lazy';button.append(img);
      button.addEventListener('click',()=>{this.index=index;this.showImage();});strip.append(button);
    });
    panel.hidden=false;this.document.body.classList.add('inspecting');this.showImage();this.$('close-reference').focus({preventScroll:true});
  }
  showImage() {
    const ref=this.references[this.index],image=this.$('reference-image'),empty=this.$('reference-empty'),source=this.$('reference-source');
    image.onload=null;image.onerror=null;image.hidden=!ref;empty.hidden=!!ref;
    this.$('reference-count').textContent=ref?`${String(this.index+1).padStart(2,'0')} / ${String(this.references.length).padStart(2,'0')}`:'—';
    source.hidden=!ref?.sourceUrl;
    source.removeAttribute('href');
    this.$('reference-well').classList.remove('loading');
    if(!ref){image.removeAttribute('src');empty.textContent='参照画像は未保存です';return;}
    this.$('reference-title').textContent=ref.title||'参考画像';image.alt=ref.title||'制作時の参考画像';
    if(ref.sourceUrl)source.href=ref.sourceUrl;
    this.$('reference-well').classList.add('loading');
    image.onload=()=>{if(image.getAttribute('src')===ref.image){this.$('reference-well').style.setProperty('--reference-aspect',String(image.naturalWidth/image.naturalHeight));this.$('reference-well').classList.remove('loading');}};
    image.onerror=()=>{if(image.getAttribute('src')!==ref.image)return;this.$('reference-well').classList.remove('loading');image.hidden=true;empty.hidden=false;empty.textContent='画像を読み込めません';};
    image.src=ref.image;
    if(image.complete&&image.naturalWidth)image.onload();
    [...this.$('reference-thumbnails').children].forEach((button,index)=>button.setAttribute('aria-pressed',String(index===this.index)));
  }
  closeReference(restore=true) {
    const wasOpen=!this.$('reference-panel').hidden;
    this.$('reference-panel').hidden=true;this.document.body.classList.remove('inspecting');
    if(restore&&wasOpen)(this.previousFocus?.isConnected?this.previousFocus:this.$('world-canvas')).focus({preventScroll:true});
  }
}
