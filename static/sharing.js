// Sharing is user initiated: no SDKs, tracking pixels, or automatic posting.
function eventShareData(event) {
  const url = new URL('/', location.origin);
  url.hash = `event/${event.id}`;
  const text = [event.title, [event.date, event.time].filter(Boolean).join(' · '),
    [event.place, event.room].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  return {title: event.title, text, url: url.href};
}

function eventShareMarkup(event) {
  const data = eventShareData(event);
  const url = encodeURIComponent(data.url);
  const text = encodeURIComponent(data.text);
  return `<section class="event-sharing" aria-labelledby="share-heading">
    <h2 id="share-heading">Поделиться событием</h2>
    ${event.status !== 'approved' ? '<p class="notice">Ссылка уже готова. Другие пользователи смогут открыть событие только после одобрения администратором.</p>' : ''}
    <div class="share-actions">
      <a class="secondary" href="https://t.me/share/url?url=${url}&text=${text}" target="_blank" rel="noopener noreferrer"><svg class="share-logo share-logo-telegram" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" d="m21.5 3.5-3.2 16c-.2 1-1 1.2-1.8.7l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.2-8.3c.4-.4-.1-.6-.6-.3L5.8 13l-4.9-1.5c-1-.3-1-1 .2-1.5l19-7.3c.9-.3 1.6.2 1.4.8Z"/></svg><span>Telegram</span></a>
      <a class="secondary" href="https://wa.me/?text=${encodeURIComponent(data.text + '\n' + data.url)}" target="_blank" rel="noopener noreferrer"><svg class="share-logo share-logo-whatsapp" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.5-4.7a8.5 8.5 0 1 1 16-4.3Z"/><path d="M8.4 7.3c-.6 0-1.3.8-1.3 1.8 0 2.6 4.3 6.9 7 6.9 1 0 1.8-.7 1.8-1.3l-2.5-1.5-1.1 1c-1.4-.6-2.5-1.7-3.1-3.1l.9-1-1.7-2.8Z"/></svg><span>WhatsApp</span></a>
      <button class="secondary" type="button" data-copy-share="Discord"><svg class="share-logo share-logo-discord" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" stroke="none" d="M19.7 5.1a18 18 0 0 0-4.5-1.4l-.6 1.2a16 16 0 0 0-5.2 0l-.6-1.2a18 18 0 0 0-4.5 1.4C1.5 9.3.7 13.3 1.1 17.2a18 18 0 0 0 5.5 2.8l1.1-1.8-1.7-.8.4-.3a13 13 0 0 0 11.2 0l.4.3-1.7.8 1.1 1.8a18 18 0 0 0 5.5-2.8c.5-4.5-.8-8.4-3.2-12.1ZM8.3 14.8c-1 0-1.8-1-1.8-2.2s.8-2.2 1.8-2.2 1.8 1 1.8 2.2-.8 2.2-1.8 2.2Zm7.4 0c-1 0-1.8-1-1.8-2.2s.8-2.2 1.8-2.2 1.8 1 1.8 2.2-.8 2.2-1.8 2.2Z"/></svg><span>Discord · копировать</span></button>
      <button class="secondary" type="button" data-copy-share="Instagram"><svg class="share-logo share-logo-instagram" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg><span>Instagram · копировать</span></button>
      <button class="secondary" type="button" data-copy-link>Скопировать ссылку</button>
      <button class="primary" type="button" data-native-share hidden>Другие приложения</button>
    </div>
    <p class="small muted">Для Discord и Instagram скопируйте приглашение и вставьте его в сообщение. На телефоне можно выбрать приложение через «Другие приложения».</p>
    <label class="field share-link">Ссылка на событие<input type="text" readonly value="${escapeHtml(data.url)}" aria-label="Ссылка на событие"></label>
    <p class="share-status small" role="status" aria-live="polite"></p>
  </section>`;
}

function bindEventSharing(event, root) {
  const panel = root.querySelector('.event-sharing');
  if (!panel) return;
  const data = eventShareData(event);
  const status = panel.querySelector('.share-status');
  const input = panel.querySelector('input');
  input.addEventListener('click', () => input.select());
  async function copy(text, message) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      status.textContent = message;
    } catch {
      input.value = text;
      input.focus();
      input.select();
      status.textContent = 'Не удалось скопировать автоматически. Скопируйте выделенный текст вручную.';
    }
  }
  panel.querySelector('[data-copy-link]').onclick = () => copy(data.url, 'Ссылка скопирована.');
  panel.querySelectorAll('[data-copy-share]').forEach(button => {
    button.onclick = () => copy(`${data.text}\n${data.url}`, `Приглашение скопировано. Вставьте его в ${button.dataset.copyShare} и отправьте.`);
  });
  const nativeButton = panel.querySelector('[data-native-share]');
  nativeButton.hidden = !navigator.share;
  nativeButton.onclick = async () => {
    try { await navigator.share(data); }
    catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Не удалось открыть меню. Выберите Telegram, WhatsApp или скопируйте ссылку.';
    }
  };
}
