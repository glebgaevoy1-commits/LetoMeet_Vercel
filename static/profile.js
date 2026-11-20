function avatarMarkup(user, className = 'profile-avatar') {
  return user.avatar_url
    ? `<img class="${className}" src="${escapeHtml(user.avatar_url)}" alt="Фото профиля">`
    : `<span class="${className} avatar-initials" aria-hidden="true">${escapeHtml((user.username || '?').trim().slice(0,2).toUpperCase())}</span>`;
}

function profileMarkup() {
  return `<section class="profile-card" aria-label="Профиль">
    <div class="profile-banner">${currentUser.banner_url ? `<img src="${escapeHtml(currentUser.banner_url)}" alt="Баннер профиля">` : ''}</div>
    <div class="profile-identity">${avatarMarkup(currentUser)}<div><h2>${escapeHtml(currentUser.username)}</h2><p class="small muted">${escapeHtml(currentUser.email)}</p></div></div>
    <details class="profile-editor"><summary>Редактировать профиль</summary>
      <form id="profile-form">
        <label class="field">Имя<input name="username" required maxlength="80" value="${escapeHtml(currentUser.username)}"></label>
        <p class="small muted">JPG, PNG или WEBP, до 4 МБ и 20 мегапикселей. Для аватара лучше квадрат, для баннера — 1500 × 500. Изображения обрезаются по центру. Аватар виден рядом с вашими комментариями.</p>
        ${['avatar','banner'].map(key=>`<div class="profile-upload"><label class="field">${key==='avatar'?'Фото профиля':'Баннер'}<input type="file" data-profile-file="${key}" accept="image/jpeg,image/png,image/webp"></label><div data-profile-preview="${key}"></div><button class="secondary" type="button" data-profile-remove="${key}">Убрать ${key==='avatar'?'фото':'баннер'}</button></div>`).join('')}
        <p class="error" id="profile-error" role="alert"></p>
        <button class="primary" type="submit">Сохранить профиль</button>
      </form>
    </details>
  </section>`;
}

function bindProfile() {
  const form=document.querySelector('#profile-form');
  const state={avatar:{url:currentUser.avatar_url},banner:{url:currentUser.banner_url}};
  const error=form.querySelector('#profile-error');
  function renderPreview(key) {
    const image=state[key];
    form.querySelector(`[data-profile-preview="${key}"]`).innerHTML=image.preview||image.url
      ? `<img class="profile-${key}-preview" src="${escapeHtml(image.preview||image.url)}" alt="Предпросмотр">` : '<p class="small muted">Изображение не выбрано</p>';
  }
  for (const key of ['avatar','banner']) {
    renderPreview(key);
    const input=form.querySelector(`[data-profile-file="${key}"]`);
    input.onchange=()=>{
      const file=input.files[0]; if (!file) return;
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)||file.size>4*1024*1024) {
        error.textContent='Выберите JPG, PNG или WEBP до 4 МБ.';input.value='';return;
      }
      if (state[key].preview) URL.revokeObjectURL(state[key].preview);
      state[key]={file,preview:URL.createObjectURL(file)};error.textContent='';renderPreview(key);
    };
    form.querySelector(`[data-profile-remove="${key}"]`).onclick=()=>{
      if (state[key].preview) URL.revokeObjectURL(state[key].preview);
      state[key]={url:null};input.value='';renderPreview(key);
    };
  }
  form.onsubmit=async e=>{
    e.preventDefault();
    if(form.dataset.busy)return;
    form.dataset.busy='1';error.textContent='';
    const name=form.elements.username.value;
    form.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    try {
      for(const key of ['avatar','banner']) if(state[key].file){
        const body=new FormData();body.append('image',state[key].file);
        const response=await fetch('/api/upload-image',{method:'POST',body});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось загрузить фото');
        state[key].url=data.image_url;delete state[key].file;
      }
      const response=await fetch('/api/me/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,avatar_url:state.avatar.url||null,banner_url:state.banner.url||null})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось сохранить профиль');
      currentUser=data.user;updateAuthPanel();
      for(const key of ['avatar','banner'])if(state[key].preview)URL.revokeObjectURL(state[key].preview);
      if(form.isConnected){await render();}
    }catch(err){if(form.isConnected)error.textContent=err.message;}
    finally{delete form.dataset.busy;form.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  };
}

async function deleteOwnedEvent(id) {
  if(!confirm('Удалить событие вместе с записями и комментариями? Восстановить его через сайт будет нельзя.'))return;
  try {
    const response=await fetch(`/api/events/${id}`,{method:'DELETE'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось удалить событие');
    await loadData();
    if(location.hash==='#account')await render();else location.hash='account';
  }catch(error){alert(error.message);}
}
