import { findRecord, MUSIC_CAPACITY } from './music-room.js';

export class MusicPanel {
  constructor({document,getCatalog,getRooms,getTarget,onModeChange,onPlace,onFocus,onGenerate,readImage}) {
    Object.assign(this,{document,getCatalog,getRooms,getTarget,onModeChange,onPlace,onFocus,onGenerate,readImage});
    this.$=(id)=>document.getElementById(id);this.mode='world';this.record=null;this.busy=false;this.adding=false;this.referenceData=null;this.fileVersion=0;
    this.$('world-mode').addEventListener('click',()=>this.setMode('world'));
    this.$('music-mode').addEventListener('click',()=>this.setMode('music'));
    this.$('music-form').addEventListener('submit',(event)=>{event.preventDefault();this.resolve();});
    this.$('music-query').addEventListener('input',()=>{this.record=null;this.$('music-result').hidden=true;this.updateSearch();this.refresh();this.setStatus('曲名から、収録アルバムとジャケットを見つけましょう。');});
    this.$('music-add').addEventListener('click',()=>this.add());
    this.$('music-focus').addEventListener('click',()=>this.onFocus());
    this.$('music-generate').addEventListener('click',()=>this.generate());
    this.$('music-reference-file').addEventListener('change',()=>this.chooseReference());
    this.updateSearch();this.refresh();
  }
  get query(){return this.$('music-query').value.trim();}
  setMode(mode,{notify=true}={}) {
    this.mode=mode==='music'?'music':'world';
    this.$('generation-form').hidden=this.mode==='music';this.$('music-form').hidden=this.mode!=='music';
    this.$('world-mode').setAttribute('aria-pressed',String(this.mode==='world'));
    this.$('music-mode').setAttribute('aria-pressed',String(this.mode==='music'));
    this.$('creation-heading').textContent=this.mode==='music'?'好きな曲を、レコードに。':'テーマから、ひと部屋。';
    this.refresh();if(notify)this.onModeChange(this.mode);
  }
  restore(mode,query) {
    if(typeof query==='string'&&query.trim())this.$('music-query').value=query.slice(0,200);
    this.updateSearch();this.setMode(mode,{notify:false});
    const record=findRecord(this.getCatalog(),this.query);if(record){this.showRecord(record);this.setStatus('このジャケットは制作済みです。Music部屋に飾れます。');}
  }
  updateSearch(){this.$('music-search').href=`https://www.google.com/search?udm=2&q=${encodeURIComponent((this.query||'好きな曲')+' アルバム ジャケット')}`;}
  resolve() {
    if(!this.query){this.$('music-query').focus();return;}
    const record=findRecord(this.getCatalog(),this.query);
    if(record){this.showRecord(record);this.setStatus('収録アルバムを確認しました。画風をそろえたジャケットを飾れます。');}
    else {
      this.record=null;this.$('music-result').hidden=true;this.$('music-reference').hidden=false;this.$('music-reference').open=true;
      this.setStatus('Google画像検索で収録アルバムとジャケットを確認し、参照画像を指定してください。');this.refresh();
    }
  }
  showRecord(record) {
    this.record=record;this.$('music-result').hidden=false;this.$('music-reference').hidden=true;
    this.$('music-result-track').textContent=this.query||record.track;
    this.$('music-result-album').textContent=record.album;this.$('music-result-artist').textContent=record.artist;
    const preview=this.$('music-cover');preview.style.backgroundImage=`url(${JSON.stringify(record.atlas)})`;
    preview.style.backgroundSize=`${record.columns*100}% ${record.rows*100}%`;
    this.$('music-source').href=record.sourceUrl;this.$('music-source').hidden=!record.sourceUrl;
    this.refresh();
  }
  setStatus(message,kind=''){this.$('music-status').textContent=message;this.$('music-status').className=`generation-status ${kind}`;}
  refresh() {
    const target=this.getTarget?.(),room=target?.roomStyle==='disco'?target:target?.address?null:this.getRooms().find((r)=>r.roomStyle==='disco'),count=room?.music?.records?.length||0;
    this.$('music-room-count').textContent=`${String(count).padStart(2,'0')} / ${MUSIC_CAPACITY}`;
    this.$('music-room-address').textContent=room?`F796-${room.address} · ラック6台`:target?.address?`F796-${target.address} にMusic部屋を作ります`:'はじめの1枚で、Music部屋ができます';
    this.$('music-focus').disabled=this.busy||this.adding||!room;
    this.$('music-add').disabled=this.busy||this.adding||!this.record;
    this.$('music-add-label').textContent=this.adding?'部屋に飾っています…':'ジャケットを部屋に飾る';
  }
  setBusy(value) {
    this.busy=Boolean(value);
    for(const id of ['world-mode','music-mode','music-query','music-lookup','music-album','music-artist','music-source-url','music-reference-file','music-generate'])this.$(id).disabled=this.busy;
    this.$('music-form').setAttribute('aria-busy',String(this.busy));this.refresh();
  }
  async add() {
    if(!this.record||this.busy||this.adding)return;
    const record=this.record;
    this.adding=true;this.refresh();
    try {
      const result=await this.onPlace(record);
      this.setStatus(result.duplicate?`『${record.album}』はすでに飾っています。曲の記録をまとめました。`:`『${record.album}』を F796-${result.room.address} に飾りました。`);
    } catch(error){this.setStatus(error.message||'ジャケットを飾れませんでした。','error');}
    finally{this.adding=false;this.refresh();}
  }
  async chooseReference() {
    const version=++this.fileVersion,file=this.$('music-reference-file').files?.[0];this.referenceData=null;
    this.$('music-reference-preview').hidden=true;this.$('music-upload-label').textContent='ジャケットの参照画像を選ぶ';
    if(!file)return;
    try {
      const data=await this.readImage(file);if(version!==this.fileVersion)return;
      this.referenceData=data;this.$('music-reference-preview').src=data;this.$('music-reference-preview').hidden=false;
      this.$('music-upload-label').textContent='参照画像を変更する';
    } catch(error){this.setStatus(error.message,'error');}
  }
  async generate() {
    if(this.busy||this.adding)return;
    const info={track:this.query,album:this.$('music-album').value.trim(),artist:this.$('music-artist').value.trim(),sourceUrl:this.$('music-source-url').value.trim()};
    try{await this.onGenerate(info,this.referenceData);}catch(error){this.setStatus(error.message||'生成できませんでした。','error');}
  }
  resume(job) {
    this.$('music-query').value=job.recordInfo.track;this.$('music-album').value=job.recordInfo.album;
    this.$('music-artist').value=job.recordInfo.artist;this.$('music-source-url').value=job.recordInfo.sourceUrl;
    this.setMode('music',{notify:false});this.$('music-result').hidden=true;this.record=null;this.updateSearch();
  }
}
