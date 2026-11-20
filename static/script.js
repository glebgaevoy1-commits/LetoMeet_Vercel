let currentUser = null;
const content = document.querySelector('#content');
const navigation = document.querySelector('#navigation');
const dialog = document.querySelector('#contacts');

const filters = {
  activity: [],
  type: [],
  duration: [],
  place: [],
  from: '',
  to: ''
};

let draft = null;
let events = [];
let filterGroups = [];
let eventsView = "map";
let selectedMapFloor;
let schoolRoomsRequest;
let mapResizeObserver;


async function loadData() {
  const [eventsResponse, filtersResponse] = await Promise.all([
    fetch('/api/events'),
    fetch('/api/filter-groups')
  ]);

  if (!eventsResponse.ok || !filtersResponse.ok) {
    throw new Error('Не удалось загрузить данные LETOMEET.');
  }

  events = await eventsResponse.json();
  filterGroups = await filtersResponse.json();
}


function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}


function dateLabel(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  });
}


function tags(event) {
  return [event.activity, event.type, event.duration, event.place]
    .map(tag => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');
}


function filterFields() {
  return filterGroups.map(group =>
    `<fieldset class="filter-group">
      <legend>${escapeHtml(group.label)}</legend>
      <div class="chips">
        ${group.options.map(option =>
          `<label class="chip">
            <input type="checkbox" name="${group.key}" value="${escapeHtml(option)}"
              ${filters[group.key].includes(option) ? 'checked' : ''}>
            ${escapeHtml(option)}
          </label>`
        ).join('')}
      </div>
    </fieldset>`
  ).join('') +
  `<fieldset class="filter-group">
    <legend>Когда</legend>
    <div class="form-grid">
      <label class="field">С даты
        <input type="date" name="from" value="${filters.from}">
      </label>
      <label class="field">По дату
        <input type="date" name="to" value="${filters.to}">
      </label>
    </div>
    <p id="date-error" class="error small" hidden>
      Дата окончания должна быть не раньше начала.
    </p>
  </fieldset>`;
}


function readFilters(form) {
  const data = new FormData(form);

  filterGroups.forEach(group => {
    filters[group.key] = data.getAll(group.key);
  });

  filters.from = data.get('from') || '';
  filters.to = data.get('to') || '';

  const valid = !filters.from || !filters.to || filters.from <= filters.to;
  const dateError = document.querySelector('#date-error');

  if (dateError) dateError.hidden = valid;

  return valid;
}

async function loadUser() {
  try {
    const response = await fetch('/api/auth/me');

    if (!response.ok) {
      currentUser = null;
      return;
    }

    const data = await response.json();
    currentUser = data.user;
  } catch {
    currentUser = null;
  }

  updateAuthPanel();
}

function updateAuthPanel() {
  const panel = document.querySelector('#auth-panel');

  if (!panel) return;

  if (!currentUser) {
    panel.innerHTML = `
      <div class="auth-links">
        <a href="#login">Войти</a>
        <a href="#register">Регистрация</a>
      </div>
    `;

    return;
  }

  panel.innerHTML = `
    <div class="auth-user">
      <span>
        Вы вошли как
        <strong>${escapeHtml(currentUser.username)}</strong>
      </span>

        <a href="#account">Личный кабинет</a>

        ${
          currentUser.role === 'admin'
            ? `<a href="#admin">Админ</a>`
            : ''
        }

        <button id="logout-button" class="plain">
          Выйти
        </button>
    </div>
  `;

  document.querySelector('#logout-button').onclick =
    async () => {
      await fetch('/api/auth/logout', {
        method: 'POST'
      });

      currentUser = null;

      location.hash = 'home';
      render();
      updateAuthPanel();
    };
}

function registerPage(step = 1, email = '') {
  if (step === 1) {
    content.innerHTML = `
      <section class="auth-page">
        <a class="back" href="#home">← На главную</a>

        <h1>Регистрация</h1>

        <form id="register-form">

          <label class="field">
            Имя
            <input
              name="username"
              maxlength="80"
              required
              placeholder="Например, Егор"
            >
          </label>

          <label class="field">
            Почта
            <input
              name="email"
              type="email"
              required
              placeholder="name@student.letovo.ru"
            >
          </label>

          <p class="small muted">
            Используйте школьную почту
            @student.letovo.ru или @letovo.ru.
          </p>

          <p id="auth-error" class="error"></p>

          <button class="primary" type="submit">
            Получить код
          </button>

        </form>

        <p>
          Уже есть аккаунт?
          <a href="#login">Войти</a>
        </p>
      </section>
    `;

    document.querySelector('#register-form').onsubmit =
      async event => {

        event.preventDefault();

        const data = Object.fromEntries(
          new FormData(event.currentTarget)
        );

        const error = document.querySelector('#auth-error');

        try {
          const response = await fetch(
            '/api/auth/register/request',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            }
          );

          const result = await response.json();

          if (!response.ok) {
            error.textContent =
              result.error || 'Не удалось отправить код.';
            return;
          }

          registerPage(2, data.email);

        } catch {
          error.textContent =
            'Сервер недоступен.';
        }
      };

    return;
  }

  content.innerHTML = `
    <section class="auth-page">
      <a class="back" href="#home">← На главную</a>

      <h1>Подтверждение</h1>

      <p>
        Мы отправили 6-значный код на
        <strong>${escapeHtml(email)}</strong>.
      </p>

      <form id="register-code-form">

        <label class="field">
          Код
          <input
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
            placeholder="123456"
          >
        </label>

        <p id="auth-error" class="error"></p>

        <button class="primary" type="submit">
          Создать аккаунт
        </button>

      </form>
    </section>
  `;

  document.querySelector('#register-code-form').onsubmit =
    async event => {

      event.preventDefault();

      const data = Object.fromEntries(
        new FormData(event.currentTarget)
      );

      data.email = email;

      const error = document.querySelector('#auth-error');

      try {
        const response = await fetch(
          '/api/auth/register/verify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          }
        );

        const result = await response.json();

        if (!response.ok) {
          error.textContent =
            result.error || 'Неверный код.';
          return;
        }

        currentUser = result.user;

        updateAuthPanel();

        location.hash = 'home';

      } catch {
        error.textContent =
          'Сервер недоступен.';
      }
    };
}

function loginPage(step = 1, email = '') {
  if (step === 1) {
    content.innerHTML = `
      <section class="auth-page">
        <a class="back" href="#home">← На главную</a>

        <h1>Вход</h1>

        <form id="login-form">

          <label class="field">
            Почта
            <input
              name="email"
              type="email"
              required
              placeholder="name@student.letovo.ru"
            >
          </label>

          <p id="auth-error" class="error"></p>

          <button class="primary" type="submit">
            Получить код
          </button>

        </form>

        <p>
          Нет аккаунта?
          <a href="#register">Зарегистрироваться</a>
        </p>
      </section>
    `;

    document.querySelector('#login-form').onsubmit =
      async event => {

        event.preventDefault();

        const data = Object.fromEntries(
          new FormData(event.currentTarget)
        );

        const error = document.querySelector('#auth-error');

        try {
          const response = await fetch(
            '/api/auth/login/request',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            }
          );

          const result = await response.json();

          if (!response.ok) {
            error.textContent =
              result.error || 'Не удалось отправить код.';
            return;
          }

          loginPage(2, data.email);

        } catch {
          error.textContent =
            'Сервер недоступен.';
        }
      };

    return;
  }

  content.innerHTML = `
    <section class="auth-page">
      <a class="back" href="#home">← На главную</a>

      <h1>Введите код</h1>

      <p>
        Код отправлен на
        <strong>${escapeHtml(email)}</strong>.
      </p>

      <form id="login-code-form">

        <label class="field">
          Код
          <input
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
            placeholder="123456"
          >
        </label>

        <p id="auth-error" class="error"></p>

        <button class="primary" type="submit">
          Войти
        </button>

      </form>
    </section>
  `;

  document.querySelector('#login-code-form').onsubmit =
    async event => {

      event.preventDefault();

      const data = Object.fromEntries(
        new FormData(event.currentTarget)
      );

      data.email = email;

      const error = document.querySelector('#auth-error');

      try {
        const response = await fetch(
          '/api/auth/login/verify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          }
        );

        const result = await response.json();

        if (!response.ok) {
          error.textContent =
            result.error || 'Неверный код.';
          return;
        }

        currentUser = result.user;

        updateAuthPanel();

        location.hash = 'home';

      } catch {
        error.textContent =
          'Сервер недоступен.';
      }
    };
}

async function adminPage() {
  if (!currentUser || currentUser.role !== 'admin') {
    content.innerHTML = `
      <section class="empty">
        <h1>Доступ запрещён</h1>
        <p class="muted">
          Эта страница доступна только администраторам.
        </p>
        <a href="#home">На главную</a>
      </section>
    `;

    return;
  }

  content.innerHTML = `
    <section class="admin-page">

      <a class="back" href="#home">
        ← На главную
      </a>

      <h1>Админ-панель</h1>

      <div id="admin-stats" class="admin-stats">
        Загрузка...
      </div>

      <section class="form-section">
        <h2>Пользователи</h2>

        <div id="admin-users">
          Загрузка...
        </div>
      </section>
        <section class="form-section">
          <h2>Мероприятия</h2>

          <div class="admin-event-tools">
            <label class="field">
              Поиск
              <input id="admin-event-search" type="search"
                placeholder="Название, ID, организатор, место...">
            </label>
            <label class="field">
              Статус
              <select id="admin-event-status">
                <option value="all">Все статусы</option>
                <option value="pending">На модерации</option>
                <option value="approved">Опубликовано</option>
                <option value="rejected">Отклонено</option>
              </select>
            </label>
            <label class="field">
              Сортировка
              <select id="admin-event-sort">
                <option value="date-asc">Сначала ближайшие</option>
                <option value="date-desc">Сначала поздние</option>
                <option value="title">По названию</option>
                <option value="id-desc">По ID: сначала новые</option>
              </select>
            </label>
          </div>
          <p id="admin-event-count" class="small muted" aria-live="polite"></p>
          <div id="admin-events">
            Загрузка...
          </div>
    </section>
  `;

  try {
    const [statsResponse, usersResponse] =
      await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/users')
      ]);

    if (!statsResponse.ok || !usersResponse.ok) {
      throw new Error();
    }

    const stats = await statsResponse.json();
    const users = await usersResponse.json();
    const response = await fetch('/api/admin/events');
    const data = await response.json();

    const eventsContainer = document.querySelector('#admin-events');
    const searchInput = document.querySelector('#admin-event-search');
    const statusSelect = document.querySelector('#admin-event-status');
    const sortSelect = document.querySelector('#admin-event-sort');
    const countLabel = document.querySelector('#admin-event-count');

    function renderAdminEvents() {
      const query = searchInput.value.trim().toLocaleLowerCase('ru');
      const status = statusSelect.value;
      const sort = sortSelect.value;

      const filtered = data.events.filter(event => {
        const searchable = [
          event.id, event.title, event.summary, event.organizer,
          event.place, event.room, event.activity, event.type
        ].join(' ').toLocaleLowerCase('ru');

        return (!query || searchable.includes(query)) &&
          (status === 'all' || event.status === status);
      });

      filtered.sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title, 'ru');
        if (sort === 'id-desc') return b.id - a.id;
        const first = `${a.date} ${a.time}`;
        const second = `${b.date} ${b.time}`;
        return sort === 'date-desc'
          ? second.localeCompare(first)
          : first.localeCompare(second);
      });

      countLabel.textContent = `Показано: ${filtered.length} из ${data.events.length}`;

      eventsContainer.innerHTML = filtered.length
        ? filtered.map(event => `
          <article class="account-event">
            <div class="admin-event-main">
              <h3>${escapeHtml(event.title)}</h3>
              <p class="meta">
                ID: ${event.id} · ${dateLabel(event.date)} · ${event.time}–${event.end}
                · ${escapeHtml(event.place)} · ${escapeHtml(event.room)}
              </p>
              <p class="muted">${escapeHtml(event.summary)}</p>
              <p>Статус: <strong>${({
                pending: 'На модерации',
                approved: 'Опубликовано',
                rejected: 'Отклонено'
              })[event.status] || escapeHtml(event.status)}</strong></p>
              ${event.moderation_comment
                ? `<p class="error">Комментарий: ${escapeHtml(event.moderation_comment)}</p>`
                : ''}
            </div>

            <div class="account-event-actions admin-event-actions">
              ${event.image_url ? `
                <a class="admin-event-image-link"
                  href="${escapeHtml(event.image_url)}"
                  target="_blank" rel="noopener noreferrer"
                  title="Открыть изображение в полном размере">
                  <img class="admin-event-image"
                    src="${escapeHtml(event.image_url)}" alt="Обложка мероприятия">
                </a>` : ''}

              <a class="secondary" href="#event/${event.id}">Открыть</a>

              ${event.status === 'approved' ? `
                <a class="secondary" href="/api/events/${event.id}/qr?download=1">
                  Скачать QR
                </a>` : ''}

              ${event.status !== 'approved' ? `
                <button class="primary" onclick="moderateEvent(${event.id}, 'approve')">
                  Одобрить
                </button>` : ''}

              ${event.status !== 'rejected' ? `
                <button class="secondary"
                  onclick="moderateEvent(${event.id}, 'reject', prompt('Причина отклонения:') || '')">
                  Отклонить
                </button>` : ''}

              ${event.status === 'approved' ? `
                <button class="secondary"
                  onclick="moderateEvent(${event.id}, 'unpublish')">
                  Снять с публикации
                </button>` : ''}
            </div>
          </article>
        `).join('')
        : '<p class="muted">По вашему запросу ничего не найдено.</p>';
    }

    searchInput.addEventListener('input', renderAdminEvents);
    statusSelect.addEventListener('change', renderAdminEvents);
    sortSelect.addEventListener('change', renderAdminEvents);
    renderAdminEvents();

    document.querySelector('#admin-stats').innerHTML = `
      <div class="admin-stat">
        <strong>${stats.users}</strong>
        <span>пользователей</span>
      </div>

      <div class="admin-stat">
        <strong>${stats.admins}</strong>
        <span>администраторов</span>
      </div>
    `;

    document.querySelector('#admin-users').innerHTML =
      users.users.length
        ? users.users.map(user => `
            <div class="admin-user">
              <div>
                <strong>
                  ${escapeHtml(user.username)}
                </strong>

                <span class="small muted">
                  ${escapeHtml(user.email)}
                </span>
              </div>

              <span class="tag">
                ${user.role === 'admin'
                  ? 'admin'
                  : 'user'}
              </span>
            </div>
          `).join('')
        : '<p class="muted">Пользователей пока нет.</p>';

  } catch {
    document.querySelector('#admin-users').innerHTML =
      '<p class="error">Не удалось загрузить данные.</p>';
  }
}

async function moderateEvent(eventId, action, comment = "") {
    const response = await fetch(
        `/api/admin/events/${eventId}/${action}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                comment: comment
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        alert(data.error || "Ошибка");
        return;
    }

    await loadData();
    await adminPage();
}

async function accountPage() {
  if (!currentUser) {
    content.innerHTML = `
      <section class="empty">
        <h1>Личный кабинет</h1>
        <p class="muted">
          Чтобы открыть личный кабинет, необходимо войти.
        </p>
        <a href="#login">Войти</a>
      </section>
    `;

    return;
  }

  content.innerHTML = `
    <section class="account-page">

      <a class="back" href="#home">
        ← На главную
      </a>

      <h1>Личный кабинет</h1>

      ${profileMarkup()}
      <section class="form-section">
        <h2>Мои мероприятия</h2>

        <div id="my-events">
          Загрузка...
        </div>
      </section>

      <section class="form-section">
        <h2>Мои записи</h2>

        <div id="my-registrations">
          Загрузка...
        </div>
      </section>

    </section>
  `;

  try {
    bindProfile();
    const [myEvents, registrations] = await Promise.all([
      getMyEvents(),
      getMyRegistrations()
    ]);

    const eventsContainer =
      document.querySelector('#my-events');

    const registrationsContainer =
      document.querySelector('#my-registrations');


    // ==========================================
    // МОИ МЕРОПРИЯТИЯ
    // ==========================================

    if (!myEvents.length) {
      eventsContainer.innerHTML = `
        <div class="empty">
          <h3>Пока нет мероприятий</h3>

          <p class="muted">
            Вы ещё не создали ни одного мероприятия.
          </p>

          <a href="#create">
            Создать мероприятие
          </a>
        </div>
      `;
    } else {
      eventsContainer.innerHTML = myEvents.map(event => `
        <article class="account-event">

          <div>
            <h3>
              ${escapeHtml(event.title)}
            </h3>

            <p class="meta">
              <span>
                ${dateLabel(event.date)}
                ·
                ${event.time}–${event.end}
              </span>

              <span>
                ${escapeHtml(event.place)}
                ·
                ${escapeHtml(event.room)}
              </span>
            </p>

            <p class="muted">
              ${escapeHtml(event.summary)}
            </p>

            <p class="muted">
              Участников: ${event.count}
            </p>

            <p class="meta">
              Статус: <strong>${({pending:'На модерации',approved:'Опубликовано',rejected:'Отклонено'})[event.status] || escapeHtml(event.status)}</strong>
            </p>

            ${event.status === 'rejected' && event.moderation_comment
              ? `<p class="error">Причина отклонения: ${escapeHtml(event.moderation_comment)}</p>`
              : ''}
          </div>

          <div class="account-event-actions">
            <a
              class="primary"
              href="#event/${event.id}"
            >
              Открыть
            </a>
            <a class="secondary" href="#edit/${event.id}">Редактировать</a>
            <button class="secondary" type="button" onclick="deleteOwnedEvent(${event.id})">Удалить</button>
          </div>

        </article>
      `).join('');
    }


    // ==========================================
    // МОИ ЗАПИСИ
    // ==========================================

    if (!registrations.length) {
      registrationsContainer.innerHTML = `
        <div class="empty">
          <h3>Пока нет записей</h3>

          <p class="muted">
            Вы ещё не записались ни на одно мероприятие.
          </p>

          <a href="#catalog">
            Посмотреть каталог
          </a>
        </div>
      `;
    } else {
      registrationsContainer.innerHTML = registrations.map(event => `
        <article class="account-event">

          <div>
            <h3>
              ${escapeHtml(event.title)}
            </h3>

            <p class="meta">
              <span>
                ${dateLabel(event.date)}
                ·
                ${event.time}–${event.end}
              </span>

              <span>
                ${escapeHtml(event.place)}
                ·
                ${escapeHtml(event.room)}
              </span>
            </p>

            <p class="muted">
              ${escapeHtml(event.summary)}
            </p>
          </div>

          <div class="account-event-actions">
            <a
              class="primary"
              href="#event/${event.id}"
            >
              Открыть
            </a>

            <button
              class="secondary"
              data-leave-event="${event.id}"
            >
              Отменить запись
            </button>
          </div>

        </article>
      `).join('');

      document
        .querySelectorAll('[data-leave-event]')
        .forEach(button => {

          button.onclick = async () => {
            const eventId =
              Number(button.dataset.leaveEvent);

            const success =
              await leaveEvent(eventId);

            if (!success) {
              return;
            }

            await accountPage();
          };
        });
    }

  } catch (error) {
    console.error(error);

    document.querySelector('#my-events').innerHTML = `
      <p class="error">
        Не удалось загрузить ваши мероприятия.
      </p>
    `;

    document.querySelector('#my-registrations').innerHTML = `
      <p class="error">
        Не удалось загрузить ваши записи.
      </p>
    `;
  }
}

function clearFilters() {
  filterGroups.forEach(group => {
    filters[group.key] = [];
  });

  filters.from = '';
  filters.to = '';
  render();
}


function homePage() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const featured = trendingEvents(events,today);
  content.innerHTML = `<section class="home" aria-label="Главная">
    <div class="home-intro"><div><p class="eyebrow">ТВОЯ ШКОЛА. ТВОИ СОБЫТИЯ.</p><h1>Встретимся в Летово.</h1><p class="muted">Найди своих людей и планы на неделю.</p></div><a class="secondary" href="#map">На карту ↗</a></div>
    <section class="trending" aria-label="Популярные события" aria-roledescription="карусель">
      <div class="trending-heading"><div><h2>Сейчас в центре внимания</h2><p class="small muted">Предстоящие события · по числу записавшихся</p></div>
      ${featured.length>1 ? '<div class="slider-controls"><button id="slide-prev" aria-label="Предыдущее событие">←</button><output id="slide-position" aria-live="polite">1 / '+featured.length+'</output><button id="slide-next" aria-label="Следующее событие">→</button></div>' : ''}</div>
      ${featured.length ? `<div class="trending-track" tabindex="0" aria-label="Листайте события свайпом или стрелками">${featured.map((e,i)=>`<article class="trend-slide" aria-label="${i+1} из ${featured.length}">
        <div class="trend-copy"><span class="trend-badge">${Number(e.count)>0 ? `${Number(e.count)} участников` : 'Будь первым участником'}</span><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.summary)}</p><p class="small">${e.regular?'Каждую неделю · ':''}${dateLabel(e.date)} · ${escapeHtml(e.time)}<br>${escapeHtml(e.place)} · ${escapeHtml(e.room)}</p><a class="primary" href="#event/${e.id}">Подробнее о событии ↗</a></div>
        <div class="trend-art">${e.image_url?`<img src="${escapeHtml(e.image_url)}" alt="" ${i?'loading="lazy"':''} decoding="async">`:`<span aria-hidden="true">${escapeHtml(e.card_emoji||'✦')}</span><span class="trend-art-label">LETOMEET / ${String(i+1).padStart(2,'0')}</span>`}</div></article>`).join('')}</div>` : '<div class="trend-empty"><h3>Следующая встреча может быть твоей</h3><p>Пока нет предстоящих опубликованных событий.</p><a class="primary" href="#create">Предложить событие</a></div>'}
    </section>
    <div class="home-choices"><a class="home-choice" href="#catalog"><span>Каталог событий</span><span class="arrow" aria-hidden="true">↗</span></a><a class="home-choice" href="#create"><span>Добавить своё событие</span><span class="arrow" aria-hidden="true">+</span></a></div>
  </section>`;
  const track=content.querySelector('.trending-track');
  if (!track || featured.length<2) return;
  let index=0;
  const prev=content.querySelector('#slide-prev'), next=content.querySelector('#slide-next'), position=content.querySelector('#slide-position');
  const update=()=>{index=Math.round(track.scrollLeft/(track.clientWidth+16)); prev.disabled=index===0;next.disabled=index===featured.length-1;position.textContent=`${index+1} / ${featured.length}`;};
  const move=delta=>track.scrollTo({left:Math.max(0,Math.min(featured.length-1,index+delta))*(track.clientWidth+16),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);
  track.onkeydown=e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}};
  track.onscroll=update;update();
}

function filtersPage() {
  content.innerHTML = `
    <section class="filter-page">
      <a class="back" href="#home">← На главную</a>
      <h1>Куда вы хотите?</h1>
      <form id="filter-form">
        ${filterFields()}
        <div class="actions">
          <button class="primary" type="submit">Показать события</button>
          <button id="reset" type="button" class="plain">Сбросить фильтры</button>
        </div>
      </form>
    </section>`;

  document.querySelector('#filter-form').onsubmit = event => {
    event.preventDefault();
    if (readFilters(event.currentTarget)) {
      location.hash = 'catalog';
    }
  };

  document.querySelector('#reset').onclick = clearFilters;
}


function filteredEvents() {
  return events
    .filter(event =>
      filterGroups.every(group =>
        !filters[group.key].length ||
        filters[group.key].includes(event[group.key])
      ) &&
      (!filters.from || event.date >= filters.from) &&
      (!filters.to || event.date <= filters.to)
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}


function updateList() {
  const list = filteredEvents();
  const results = document.querySelector('#results');

  results.innerHTML = `
    <div class="list-heading">
      <p>Найдено: ${list.length}</p>
      <span class="small muted">По дате ↑</span>
    </div>
    ${
      list.length
        ? list.map(event => {
            const allowedColors = [
              'cream', 'blue', 'green',
              'lavender', 'peach', 'pink', 'dark'
            ];

            const color = allowedColors.includes(event.card_color)
              ? event.card_color
              : 'cream';

            let emoji = event.card_emoji;

            if (!emoji) {
              const category = [
                event.activity,
                event.type
              ].join(' ').toLowerCase();

              if (category.includes('спорт')) emoji = '🏀';
              else if (category.includes('кино') || category.includes('фильм') || category.includes('просмотр')) emoji = '🎬';
              else if (category.includes('игр')) emoji = '🎮';
              else if (category.includes('музык')) emoji = '🎵';
              else if (category.includes('it') || category.includes('программ')) emoji = '💻';
              else if (category.includes('искусств')) emoji = '🎨';
              else if (category.includes('литератур')) emoji = '📚';
              else if (category.includes('наук') || category.includes('учеб') || category.includes('олимп')) emoji = '🧠';
              else emoji = '✨';
            }

            return `
              <a
                href="#event/${event.id}"
                class="event-row event-card event-card-${color}"
              >
                <div class="event-row-content">
                  ${
                    event.image_url
                      ? `<img
                          class="event-row-image"
                          src="${escapeHtml(event.image_url)}"
                          alt=""
                        >`
                      : ''
                  }

                  <div class="event-row-info">
                    <div class="event-card-title">
                      <span class="event-card-emoji">${escapeHtml(emoji)}</span>
                      <h2>${escapeHtml(event.title)}</h2>
                    </div>

                    ${
                      event.tagline
                        ? `<p class="event-card-tagline">${escapeHtml(event.tagline)}</p>`
                        : ''
                    }

                    <p>${escapeHtml(event.summary)}</p>

                    <div class="meta">
                      <span>${dateLabel(event.date)} · ${event.time}–${event.end}</span>
                      <span>${escapeHtml(event.room)}</span>
                      ${event.regular ? '<span>Еженедельно</span>' : ''}
                    </div>

                    <div class="chips">${tags(event)}</div>
                    <div class="catalog-map" data-event-map="${event.id}"></div>

                    <div class="meta">
                      <span>Организатор: ${escapeHtml(event.organizer)}</span>
                      <span>Участников: ${event.count}</span>
                    </div>
                  </div>
                </div>
              </a>
            `;
          }).join('')
        : `
          <div class="empty">
            <h2>Пока ничего не нашлось</h2>
            <p class="muted">Попробуйте выбрать меньше фильтров или другой диапазон дат.</p>
            <button id="empty-reset">Сбросить фильтры</button>
          </div>
        `
    }`;

  const mapSlots = Array.from(results.querySelectorAll('[data-event-map]'));
  loadRooms().then(rooms => {
    mapSlots.forEach(slot => {
      if (!slot.isConnected) return;
      const event = list.find(e => e.id === Number(slot.dataset.eventMap));
      const room = findSchoolRoom(rooms, event?.room);
      if (room) slot.innerHTML = roomMapMarkup(room, true);
    });
  }).catch(() => {});
  const reset = document.querySelector('#empty-reset');
  if (reset) reset.onclick = clearFilters;
}



function catalogPage() {
  content.innerHTML = `
    <div class="heading">
      <h1>Список событий</h1>
      <span class="small muted">События LETOMEET</span>
    </div>

    <div class="catalog-layout">
      <aside class="sidebar"><details class="catalog-filters" ${matchMedia('(min-width: 761px)').matches ? 'open' : ''}><summary>Фильтры событий</summary>
        <form id="filter-form">
          ${filterFields()}
          <button class="plain" type="button" id="reset">Сбросить фильтры</button>
        </form>
      </details></aside>

      <section id="results" aria-label="События" aria-live="polite"></section>
    </div>`;

  document.querySelector('#filter-form').onchange = event => {
    if (readFilters(event.currentTarget)) updateList();
  };

  document.querySelector('#filter-form').onsubmit = event => {
    event.preventDefault();
  };

  document.querySelector('#reset').onclick = clearFilters;
  updateList();
}


function safeContact(value) {
  try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? value : ''; }
  catch { return ''; }
}
function contactLinks(event) {
  event = {...event, chat:safeContact(event.chat), contact:safeContact(event.contact)};
  return `
    ${
      event.chat
        ? `<a class="contact" href="${escapeHtml(event.chat)}" target="_blank" rel="noopener noreferrer">Чат события ↗</a>`
        : '<p class="contact muted">Чат события: ссылка пока не добавлена</p>'
    }
    ${
      event.contact
        ? `<a class="contact" href="${escapeHtml(event.contact)}" target="_blank" rel="noopener noreferrer">Написать организатору ↗</a>`
        : '<p class="contact muted">ЛС организатора: ссылка пока не добавлена</p>'
    }`;
}

async function joinEvent(eventId) {
  try {
  const response = await fetch(`/api/events/${eventId}/join`, {
    method: 'POST'
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.error || 'Не удалось записаться');
    return false;
  }

  return true;
  } catch { alert('Не удалось связаться с сервером. Попробуйте ещё раз.'); return false; }
}

async function leaveEvent(eventId) {
  try {
  const response = await fetch(`/api/events/${eventId}/join`, {
    method: 'DELETE'
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.error || 'Не удалось отменить запись');
    return false;
  }

  return true;
  } catch { alert('Не удалось связаться с сервером. Попробуйте ещё раз.'); return false; }
}

async function getMyRegistrations() {
  const response = await fetch('/api/me/registrations');

  if (!response.ok) {
    throw new Error('Не удалось загрузить записи');
  }

  const data = await response.json();

  return data.events || [];
}
async function getMyEvents() {
  const response = await fetch('/api/me/events');

  if (!response.ok) {
    throw new Error('Не удалось загрузить мои мероприятия');
  }

  const data = await response.json();

  return data.events || [];
}

async function eventPage(event, preview = false) {
  if (!event) {
    content.innerHTML = '<h1>Событие не найдено</h1><a href="#catalog">Вернуться в каталог</a>';
    return;
  }

  const published = event.status === "approved";
  content.innerHTML = `
    <a class="back" href="${preview ? '#create' : '#' + eventsView}">
      ← ${preview ? 'Вернуться к форме' : (eventsView === 'map' ? 'К карте событий' : 'К списку событий')}
    </a>

    ${preview ? '<p class="notice">Предпросмотр заявки. Она ещё не отправлена и не опубликована.</p>' : ''}
    ${!preview && !published ? `<section class="notice" role="status">
      <h2>${event.status === 'rejected' ? 'Заявка отклонена' : 'Событие сохранено — ожидает одобрения'}</h2>
      <p>Пока событие не опубликовано, оно не отображается в каталоге и на карте. Запись и комментарии станут доступны после одобрения администратором.</p>
      ${event.moderation_comment ? `<p>Комментарий администратора: ${escapeHtml(event.moderation_comment)}</p>` : ''}
      <a href="#account">Мои события</a>
      ${event.status === 'rejected' && currentUser && event.creator_id === currentUser.id
        ? ` · <a href="#edit/${event.id}">Исправить мероприятие</a>`
        : ''}
      ${currentUser?.role === 'admin' ? ' · <a href="#admin">Открыть модерацию</a>' : ''}
      <button type="button" class="secondary" id="refresh-event-status">Обновить статус</button>
    </section>` : ''}


    <article class="detail">
  ${
    event.image_url
      ? `<img
          class="event-detail-image"
          src="${escapeHtml(event.image_url)}"
          alt="Обложка мероприятия"
        >`
      : ''
  }

      <h1>${escapeHtml(event.title)}</h1>
      ${!preview && currentUser?.id === event.creator_id ? `<div class="owner-event-actions"><a class="secondary" href="#edit/${event.id}">Редактировать</a><button class="secondary" type="button" onclick="deleteOwnedEvent(${event.id})">Удалить событие</button></div>` : ''}

      <div class="meta">
        <span>${dateLabel(event.date)} · ${event.time}–${event.end}</span>
        <span>${escapeHtml(event.place)} · ${escapeHtml(event.room)}</span>
        ${event.regular ? '<span>Каждую неделю</span>' : ''}
      </div>

      <div class="detail-grid">
        <div>
          <p class="description">${escapeHtml(event.description)}</p>

          ${
            (preview || !published)
              ? ''
              : `<div class="join-line">
                <button id="join" class="primary">
                    Я пойду
                </button>

                <button id="leave" class="secondary" style="display: none;">
                    Отменить запись
                </button>

                <span id="count" class="small">
                    Участников: ${event.count}
                </span>
            </div>`
          }
        </div>

        <aside class="detail-side">
          <h2>Теги</h2>
          <div class="chips">${tags(event)}</div>

          <h2>Контакты</h2>
          <p>Организатор: ${escapeHtml(event.organizer)}</p>
          ${contactLinks(event)}
        </aside>
      </div>
      <section class="event-location-card" id="event-location-card"><h2>Место на карте</h2><p class="muted">Загружаем план…</p></section>
      ${!preview ? eventShareMarkup(event) : ''}
      ${!preview && published ? `
        <section class="event-qr-card" aria-labelledby="event-qr-title">
          <div>
            <h2 id="event-qr-title">QR-код события</h2>
            <p class="muted">Отсканируйте QR-код, чтобы открыть страницу этого события.</p>
            <a class="secondary" href="/api/events/${event.id}/qr?download=1" download>
              Скачать QR-код
            </a>
          </div>
          <img src="/api/events/${event.id}/qr" alt="QR-код мероприятия ${event.id}" width="180" height="180">
        </section>` : ''}
    </article>`;

    const detail = document.querySelector('.detail');
    if (!preview) bindEventSharing(event, detail);
    eventLocationCard(event, detail.querySelector('#event-location-card'));
    if (!preview && !published) {
      document.querySelector('#refresh-event-status').onclick = render;
    }
    if (!preview && published) {
      await commentsPanel(event.id);
      if (!detail.isConnected) return;
      const joinButton = document.querySelector('#join');
      const leaveButton = document.querySelector('#leave');

      if (!currentUser) {
        joinButton.textContent = 'Войти, чтобы записаться';

        joinButton.onclick = () => {
          location.hash = 'login';
        };

        return;
      }

      let registrations;
      try { registrations = await getMyRegistrations(); }
      catch { joinButton.disabled = true; joinButton.textContent = 'Обновите страницу, чтобы проверить запись'; return; }
      if (!detail.isConnected) return;

      let isJoined = registrations.some(
        registeredEvent => registeredEvent.id === event.id
      );

  if (isJoined) {
    joinButton.textContent = 'Вы идёте · открыть контакты';
    leaveButton.style.display = 'inline-block';
  }

  // Кнопка "Я пойду"
  joinButton.onclick = async () => {
    // Если уже записан — открываем контакты
    if (isJoined) {
      document.querySelector('#dialog-links').innerHTML =
        contactLinks(event);

      dialog.showModal();
      return;
    }

    const success = await joinEvent(event.id);

    if (!success) {
      return;
    }

    isJoined = true;

    joinButton.textContent = 'Вы идёте · открыть контакты';
    leaveButton.style.display = 'inline-block';

    event.count += 1;

    document.querySelector('#count').textContent =
      'Участников: ' + event.count;

    document.querySelector('#dialog-links').innerHTML =
      contactLinks(event);

    dialog.showModal();
  };

  // Кнопка "Отменить запись"
  leaveButton.onclick = async () => {
    const success = await leaveEvent(event.id);

    if (!success) {
      return;
    }

    isJoined = false;

    joinButton.textContent = 'Я пойду';
    leaveButton.style.display = 'none';

    event.count -= 1;

    document.querySelector('#count').textContent =
      'Участников: ' + event.count;
  };
}
}


function selectField(key, label, options) {
  return `
    <label class="field">
      ${escapeHtml(label)}
      <select name="${key}" required>
        <option value="">Выберите</option>
        ${options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
      </select>
    </label>`;
}



function createPage(editEvent = null) {
  if (!currentUser) {
    content.innerHTML = `
      <section class="empty">
        <h1>Добавить событие</h1>

        <p class="muted">
          Чтобы создать мероприятие, необходимо войти в аккаунт.
        </p>

        <a href="#login">Войти</a>
      </section>
    `;

    return;
  }

  const groupsWithoutPlace = filterGroups.filter(
    group => group.key !== 'place'
  );

  const placeGroup = filterGroups.find(
    group => group.key === 'place'
  );

  content.innerHTML = `
    <section class="event-form">
      <a class="back" href="#home">← На главную</a>
      <h1>${editEvent ? "Редактировать мероприятие" : "Добавить своё событие"}</h1>
      ${editEvent ? `<section class="notice"><strong>Изменения должны пройти модерацию.</strong><p>После сохранения событие будет скрыто из каталога и карты до одобрения. Записи участников и комментарии сохранятся.</p><p>${escapeHtml(editEvent.moderation_comment || '')}</p><a href="#event/${editEvent.id}">Вернуться к событию</a></section>` : ''}

      <form id="event-form">
        <div class="form-grid">

          <label class="field full">
            Название мероприятия
            <input
              name="title"
              required
              maxlength="120"
              placeholder="Например, Вечер настольных игр"
            >
          </label>

          <div class="field full">
              Оформление карточки

              <div class="card-design-options">
                <fieldset class="color-picker">
                  <legend>Цвет карточки</legend>
                  <div class="color-swatches">
                    ${[['cream','Кремовый'],['blue','Голубой'],['green','Зелёный'],['lavender','Лавандовый'],['peach','Персиковый'],['pink','Розовый'],['dark','Тёмный']].map(([value,label]) => `
                      <label class="color-option">
                        <input type="radio" name="card_color" value="${value}" ${value==='cream'?'checked':''}>
                        <span class="color-swatch event-card-${value}" aria-hidden="true"></span>
                        <span>${label}</span>
                      </label>`).join('')}
                  </div>
                  <div id="card-color-preview" class="card-color-preview event-card-cream">
                    <strong>Так будет выглядеть карточка</strong>
                    <p class="small">Выбранный цвет: <span id="card-color-name">Кремовый</span></p>
                  </div>
                </fieldset>

                <label class="field">
                  Эмодзи
                  <select name="card_emoji">
                    <option value="">Автоматически</option>
                    <option value="🎓">🎓 Образование</option>
                    <option value="🎬">🎬 Кино</option>
                    <option value="🎮">🎮 Игры</option>
                    <option value="🏀">🏀 Спорт</option>
                    <option value="🎵">🎵 Музыка</option>
                    <option value="💻">💻 IT</option>
                    <option value="🎨">🎨 Искусство</option>
                    <option value="🧠">🧠 Интеллект</option>
                    <option value="📚">📚 Литература</option>
                    <option value="⚽">⚽ Футбол</option>
                    <option value="🏆">🏆 Соревнования</option>
                    <option value="🎤">🎤 Выступления</option>
                  </select>
                </label>
              </div>
            </div>

            <label class="field full">
              Короткий слоган
              <input
                name="tagline"
                maxlength="80"
                placeholder="Например, вечер, который нельзя пропустить"
              >
              <span class="small muted">Необязательно, максимум 80 символов.</span>
            </label>

          <label class="field full">
            Краткое описание
            <input
              name="summary"
              required
              maxlength="180"
              placeholder="Коротко: что будет происходить"
            >
          </label>

          <label class="field full">
            Описание
            <textarea
              name="description"
              required
              maxlength="4000"
              placeholder="Что будете делать, кому можно прийти и что взять с собой?"
            ></textarea>
          </label>

          <div class="field full">
            <label for="event-image">Обложка мероприятия — необязательно</label>
            <input id="event-image" type="file" name="image" accept="image/jpeg,image/png,image/webp" aria-describedby="image-help image-status">
            <span id="image-help" class="small muted">JPG, PNG или WEBP · до 4 МБ · до 20 мегапикселей. Любые пропорции; рекомендуем 1600 × 900 пикселей (16:9). HEIC и SVG не поддерживаются. На карточке края могут обрезаться.</span>
            <div id="image-preview-panel" hidden>
              <img id="image-preview" class="upload-preview" alt="Предпросмотр обложки">
              <button type="button" class="secondary" id="remove-image">Убрать фото</button>
            </div>
            <span id="image-status" class="small" role="status"></span>
          </div>

        </div>

        <section class="form-section">
          <h2>Когда и где</h2>

          <div class="form-grid">
            <label class="field">
              Дата
              <input type="date" name="date" required>
            </label>

            <label class="field">
              Повторение
              <select name="regular">
                <option value="false">Один раз</option>
                <option value="true">Каждую неделю</option>
              </select>
            </label>

            <label class="field">
              Начало
              <input type="time" name="time" required>
            </label>

            <label class="field">
              Окончание
              <input type="time" name="end" required>
            </label>

            ${selectField('place', 'Место', placeGroup.options)}

            <label class="field">
              Где именно
              <input
                name="room"
                required
                maxlength="100"
                placeholder="Кабинет, гостиная, этаж"
              >
            </label>
          </div>
        </section>

        <section class="form-section">
          <h2>Теги</h2>

          <div class="form-grid">
            ${groupsWithoutPlace.map(
              group => selectField(group.key, group.label, group.options)
            ).join('')}
          </div>
        </section>

        <section class="form-section">
          <h2>Контакты</h2>

          <div class="form-grid">
            <label class="field full">
              Имя организатора
              <input name="organizer" required maxlength="80">
            </label>

            <label class="field">
              Ссылка на чат события
              <input
                type="url"
                name="chat"
                placeholder="https://t.me/…"
              >
            </label>

            <label class="field">
              Ссылка на ЛС организатора
              <input
                type="url"
                name="contact"
                placeholder="https://t.me/…"
              >
            </label>
          </div>
        </section>

        <p class="muted">После сохранения на странице события появятся кнопки для отправки приглашения в Telegram, WhatsApp и другие приложения. Событие станет доступно всем после модерации.</p>
        <p class="error" id="form-error" role="alert"></p>

        <button class="primary" type="submit">
          ${editEvent ? 'Сохранить изменения и отправить на модерацию' : 'Создать событие'}
        </button>
      </form>
    </section>
  `;

  const form = document.querySelector('#event-form');
  const roomInput = form.elements.room;
  if (roomInput) {
    roomInput.setAttribute('list', 'school-rooms');
    const list = document.createElement('datalist'); list.id = 'school-rooms';
    form.append(list);
    loadSchoolRooms().then(rooms => {
      list.innerHTML = rooms.filter(r => !/^(h|std|TR)/.test(r.name)).map(r => `<option value="${escapeHtml(r.name)}">Этаж ${r.floor}</option>`).join('');
    }).catch(() => {});
  }


  const formValues = editEvent || draft;
  if (formValues) {
    Object.keys(formValues).forEach(key => {
      if (key !== 'image' && key !== 'id' && key !== 'creator_id' &&
          key !== 'count' && key !== 'status' && key !== 'moderation_comment' &&
          form.elements[key]) {
        const field = form.elements[key];
        const value = String(formValues[key] ?? '');
        if (field.tagName === 'SELECT' && value && !Array.from(field.options).some(o => o.value === value)) {
          field.add(new Option(value, value));
        }
        field.value = value;
      }
    });
  }

  const colorLabels = {cream:'Кремовый',blue:'Голубой',green:'Зелёный',lavender:'Лавандовый',peach:'Персиковый',pink:'Розовый',dark:'Тёмный'};
  function updateColorPreview() {
    const value = form.elements.card_color.value;
    const preview = form.querySelector('#card-color-preview');
    preview.className = `card-color-preview event-card-${value}`;
    form.querySelector('#card-color-name').textContent = colorLabels[value];
  }
  form.querySelectorAll('[name="card_color"]').forEach(input => input.addEventListener('change', updateColorPreview));
  updateColorPreview();

  const imageInput = form.elements.image;
  const imagePanel = form.querySelector('#image-preview-panel');
  const imagePreview = form.querySelector('#image-preview');
  const imageStatus = form.querySelector('#image-status');
  let photoVersion = 0;
  let photoInvalid = false;
  let photoChecking = false;
  let existingImageUrl = editEvent?.image_url || null;

  if (existingImageUrl) {
    imagePreview.src = existingImageUrl;
    imagePanel.hidden = false;
    imageStatus.textContent = 'Текущая обложка мероприятия';
  }

  form.querySelector('#remove-image').onclick = () => {
    photoVersion++;
    imageInput.value = '';
    imagePreview.removeAttribute('src');
    imagePanel.hidden = true;
    imageStatus.textContent = '';
    photoInvalid = false;
    photoChecking = false;
    existingImageUrl = null;
  };
  imageInput.onchange = async () => {
    const version = ++photoVersion;
    imagePreview.removeAttribute('src'); imagePanel.hidden = true;
    photoInvalid = false; photoChecking = false; imageStatus.textContent = '';
    const file = imageInput.files[0];
    if (!file) {
      if (existingImageUrl) { imagePreview.src = existingImageUrl; imagePanel.hidden = false; imageStatus.textContent = 'Текущая обложка мероприятия'; }
      return;
    }
    imagePanel.hidden = false; // Keep removal available even for invalid files.
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      imageStatus.textContent = 'Выберите JPG, PNG или WEBP. HEIC и SVG не поддерживаются.'; photoInvalid = true; return;
    }
    if (file.size > 4 * 1024 * 1024) {
      imageStatus.textContent = 'Файл больше 4 МБ. Уменьшите его или уберите фото.'; photoInvalid = true; return;
    }
    photoChecking = true; imageStatus.textContent = 'Проверяем фото…';
    try {
      const dataUrl = await new Promise((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const size = await new Promise((resolve,reject) => {
        const img = new Image(); img.onload = () => resolve([img.naturalWidth,img.naturalHeight]); img.onerror = reject; img.src = dataUrl;
      });
      if (version !== photoVersion) return;
      if (size[0]*size[1] > 20000000) {
        photoInvalid = true; imageStatus.textContent = 'Больше 20 мегапикселей. Уменьшите разрешение или уберите фото.'; return;
      }
      imagePreview.src = dataUrl;
      imageStatus.textContent = `${file.name} · ${size[0]} × ${size[1]} · ${(file.size/1024/1024).toFixed(2)} МБ`;
    } catch(e) {
      if (version !== photoVersion) return;
      photoInvalid = true; imageStatus.textContent = 'Не удалось прочитать фото. Выберите другой файл или уберите его.';
    } finally { if (version === photoVersion) photoChecking = false; }
  };

  form.oninput = () => {
    if (editEvent) return;
    const formData = new FormData(form);
    formData.delete('image');
    draft = Object.fromEntries(formData);
  };

  form.onsubmit = async event => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    const submitButton = form.querySelector('[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Сохраняем…';
    try {

    const data = Object.fromEntries(new FormData(form));

    const imageFile = data.image;
    delete data.image;

    const error = form.querySelector('#form-error');
    error.textContent = '';

    if (photoChecking || photoInvalid) {
      error.textContent = photoChecking ? 'Дождитесь проверки фото.' : 'Исправьте ошибку фото или нажмите «Убрать фото».';
      return;
    }
    // Проверка размера изображения
    if (imageFile && imageFile.size > 4 * 1024 * 1024) {
      error.textContent = 'Изображение должно быть не больше 4 МБ.';
      return;
    }

    // Проверка времени
    if (data.end <= data.time) {
      error.textContent = 'Окончание должно быть позже начала. Укажите время в пределах одного дня.';
      return;
    }

    // Проверка ссылок
    for (const key of ['chat', 'contact']) {
      if (!data[key]) continue;

      try {
        const url = new URL(data[key]);

        if (!['https:', 'http:'].includes(url.protocol)) {
          error.textContent = 'Ссылки должны начинаться с https:// или http://.';
          return;
        }
      } catch {
        error.textContent = 'Проверьте ссылки на чат и ЛС организатора.';
        return;
      }
    }

    // Проверка текстовых полей
    for (const key of [
      'title',
      'summary',
      'description',
      'room',
      'organizer'
    ]) {
      data[key] = data[key].trim();

      if (!data[key]) {
        error.textContent = 'Заполните текстовые поля: одних пробелов недостаточно.';
        return;
      }
    }

    // Загрузка изображения
    let imageUrl = null;

    if (imageFile && imageFile.size > 0) {
      const imageData = new FormData();
      imageData.append('image', imageFile);

      try {
        const uploadResponse = await fetch('/api/upload-image', {
          method: 'POST',
          body: imageData
        });

        const uploadResult = await readResponse(uploadResponse);

        if (!uploadResponse.ok) {
          error.textContent = uploadResult.error || 'Не удалось загрузить изображение.';
          return;
        }

        imageUrl = uploadResult.image_url;
        existingImageUrl = imageUrl;
        imageInput.value = '';

      } catch (failure) {
        error.textContent = failure.message || 'Не удалось загрузить изображение.';
        return;
      }
    }

    // Подготовка данных мероприятия
    const payload = {
      ...data,
      regular: data.regular === 'true',
      image_url: imageUrl || existingImageUrl || null
    };

    // Create a new event or resubmit the corrected rejected event.
    try {
      const response = await fetch(
        editEvent ? `/api/events/${editEvent.id}` : '/api/events',
        {
          method: editEvent ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await readResponse(response);

      if (!response.ok) {
        error.textContent = result.error || 'Не удалось создать событие.';
        return;
      }

      if (!editEvent) draft = null;
      const savedEvent = result.event || result;
      if (form.isConnected) location.hash = `event/${savedEvent.id}`;

    } catch (requestError) {
      error.textContent = requestError.message || 'Не удалось связаться с сервером. Попробуйте ещё раз.';
    }
    } finally {
      form.dataset.submitting = 'false';
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  };
}



async function render() {
  if (dialog.open) dialog.close();
  content.querySelectorAll("dialog[open]").forEach(item => item.close());
  mapResizeObserver?.disconnect();

  const hash = location.hash;
  const route = hash.slice(1) || (location.pathname === '/map' ? 'map' : 'home');
  navigation.hidden = false;

  navigation.querySelectorAll('a').forEach(link => {
    link.removeAttribute('aria-current');

    if (link.hash === '#' + route) {
      link.setAttribute('aria-current', 'page');
    }
  });

  if (route === 'home') {
    homePage();

  } else if (route === 'filters') {
    filtersPage();

  } else if (route === 'catalog') {
    try { await loadData(); } catch (error) {
      if (location.hash === hash) content.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (location.hash !== hash) return;
    eventsView = 'catalog';
    catalogPage();

  } else if (route === 'map' || route.startsWith('map/')) {
    eventsView = 'map';
    await mapPage(Number(route.split("/")[1]) || null);

  } else if (route === 'create') {
    createPage();

  } else if (route.startsWith('edit/')) {
    const id = Number(route.split('/')[1]);
    try {
      const response = await fetch(`/api/events/${id}`, {cache: 'no-store'});
      const event = response.ok ? await response.json() : null;
      if (location.hash !== hash) return;
      if (!event || event.creator_id !== currentUser?.id) {
        content.innerHTML = '<section class="empty"><h1>Редактирование недоступно</h1><p>Редактировать можно только собственные мероприятия.</p><a href="#account">Вернуться в личный кабинет</a></section>';
      } else {
        createPage(event);
      }
    } catch {
      if (location.hash === hash) {
        content.innerHTML = '<p class="error">Не удалось загрузить мероприятие. Попробуйте ещё раз.</p><a href="#account">Мои события</a>';
      }
    }

  } else if (route === 'preview' && draft) {
    eventPage(
      {...draft, regular: draft.regular === 'true'},
      true
    );

  } else if (route.startsWith('event/')) {
    const id = Number(route.split('/')[1]);

    let event;
    try {
      const response = await fetch(`/api/events/${id}`, {cache:'no-store'});
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (location.hash === hash) content.innerHTML = `<p class="error" role="alert">${escapeHtml(result.error || 'Не удалось открыть событие. Проверьте вход в аккаунт и попробуйте снова.')}</p><a href="#account">Мои события</a>`;
        return;
      }
      event = await response.json();
    } catch {
      if (location.hash === hash) content.innerHTML = '<p class="error" role="alert">Не удалось загрузить событие. Проверьте соединение и обновите страницу.</p>';
      return;
    }

    if (location.hash !== hash) return;
    await eventPage(event);

  } else if (route === 'login') {
    loginPage();

  } else if (route === 'register') {
    registerPage();

    } else if (route === 'admin') {
      await adminPage();

    } else if (route === 'account') {
      await accountPage();

  } else {
    content.innerHTML =
      '<h1>Страница не найдена</h1><a href="#home">На главную</a>';
  }

  if (location.hash === hash) window.scrollTo(0, 0);
}


document.querySelector('#close-dialog').onclick = () => dialog.close();
document.querySelector('#done-dialog').onclick = () => dialog.close();

dialog.onclick = event => {
  if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();

    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    ) {
      dialog.close();
    }
  }
};


window.addEventListener('hashchange', render);


(async function init() {
  try {
    await loadUser();
    await loadData();
    await render();
  } catch (error) {
    content.innerHTML = `
      <section class="empty">
        <h1>LETOMEET</h1>
        <p class="error">
          ${escapeHtml(error.message)}
        </p>
        <p>Проверь, что Flask-сервер запущен.</p>
      </section>`;
  }
})();


async function commentsPanel(eventId) {
  const panel = document.createElement('section');
  panel.className = 'comments-panel';
  document.querySelector('.detail').append(panel);
  panel.innerHTML = `<h2>Комментарии</h2><div class="comment-list"></div>
    ${currentUser ? '<form class="comment-form"><label class="field">Ваш комментарий<textarea name="body" maxlength="2000" required></textarea></label><button class="primary">Отправить</button></form>' : '<p><a href="#login">Войдите</a>, чтобы оставить комментарий.</p>'}<p role="status" class="error"></p>`;
  const status = panel.querySelector('[role=status]');
  async function refresh() {
    const response = await fetch(`/api/events/${eventId}/comments`);
    if (!response.ok) throw new Error('Не удалось загрузить комментарии');
    const rows = await response.json();
    panel.querySelector('.comment-list').innerHTML = rows.length ? rows.map(c => `<article class="comment"><div class="comment-author">${avatarMarkup({username:c.author,avatar_url:c.avatar_url},"comment-avatar")}<strong>${escapeHtml(c.author)}</strong></div><p>${escapeHtml(c.body)}</p><small>${escapeHtml(new Date(c.created_at).toLocaleString('ru'))}</small>${c.can_delete ? `<button class="plain" data-delete="${c.id}">Удалить</button>` : ''}</article>`).join('') : '<p class="muted">Пока нет комментариев.</p>';
  }
  panel.onclick = async e => {
    const id = e.target.dataset.delete;
    if (!id) return;
    try {
      const r = await fetch(`/api/comments/${id}`, {method:'DELETE'});
      if (!r.ok) throw new Error('Не удалось удалить комментарий');
      await refresh();
    } catch (e) { status.textContent = e.message; }
  };
  const form = panel.querySelector('form');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const r = await fetch(`/api/events/${eventId}/comments`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({body:form.elements.body.value})});
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      form.reset(); status.textContent = ''; await refresh();
    } catch(e) { status.textContent = e.message; }
    finally { button.disabled = false; }
  };
  try { await refresh(); } catch(e) { status.textContent = e.message; }
}

function loadSchoolRooms() {
  if (!schoolRoomsRequest) {
    schoolRoomsRequest = fetch('/static/maps/rooms.json')
      .then(response => {
        if (!response.ok) throw new Error('Не удалось загрузить данные о кабинетах.');
        return response.json();
      })
      .catch(error => {
        schoolRoomsRequest = null;
        throw error;
      });
  }
  return schoolRoomsRequest;
}

function normalizeRoom(name) {
  const room = String(name).trim().toLowerCase();
  const classroom = room.match(/^(?:(?:каб\.?|кабинет|аудитория)\s+)?[cс]?(\d{3})$/);
  return classroom ? `c${classroom[1]}` : room;
}

function roomPosition(room) {
  return {x: (room.marker_x ?? room.x) / room.reference_width, y: (room.marker_y ?? room.y) / room.reference_height};
}

function pinPosition({x, y}) {
  return `left:${x * 100}%;top:${y * 100}%`;
}

function schoolMap() {
  return '<div class="school-map"><img alt=""><div class="map-pins" hidden></div></div>';
}

function setSchoolFloor(map, floor, status) {
  const image = map.querySelector('img');
  const pins = map.querySelector('.map-pins');
  pins.hidden = true;
  image.alt = `План школы, этаж ${floor}`;
  image.onload = () => { pins.hidden = false; };
  image.onerror = () => { status.textContent = 'Не удалось загрузить план этажа.'; };
  image.src = `/static/maps/floor_${floor}.png`;
}

async function loadEventLocation(section, roomName) {
  const status = section.querySelector('[data-map-status]');
  try {
    const rooms = await loadSchoolRooms();
    if (!section.isConnected) return;

    const room = rooms.find(room => normalizeRoom(room.name) === normalizeRoom(roomName));
    if (!room) {
      status.textContent = 'Это место не отмечено на плане школы.';
      return;
    }

    section.insertAdjacentHTML('beforeend', schoolMap());
    const map = section.querySelector('.school-map');
    map.querySelector('.map-pins').innerHTML = `
      <span class="map-pin" style="${pinPosition(roomPosition(room))}"
        role="img" aria-label="${escapeHtml(room.name)}"></span>`;
    status.textContent = `${room.name} · этаж ${room.floor}`;
    setSchoolFloor(map, room.floor, status);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function mapPage(focusedId = null) {
  const hash = location.hash;
  content.innerHTML = `<section aria-labelledby="map-title">
    <h1 id="map-title">Карта событий</h1>
    <p class="small muted" id="map-message" role="status">Загружаем карту…</p>
    <div class="map-controls" hidden>
      <label class="field">Этаж<select id="map-floor"></select></label>
      <div class="map-zoom-controls" role="group" aria-label="Масштаб карты">
        <div class="map-zoom-range">
          <label for="map-zoom">Масштаб</label><input id="map-zoom" type="range" min="50" max="300" step="25" value="100">
          <output id="map-zoom-label" for="map-zoom">100%</output>
        </div>
        <div class="map-zoom-buttons">
          <button type="button" class="secondary" id="map-zoom-out" aria-label="Уменьшить карту">−</button>
          <button type="button" class="secondary" id="map-zoom-in" aria-label="Увеличить карту">+</button>
          <button type="button" class="secondary" id="map-zoom-reset">По ширине</button>
        </div>
      </div>
    </div>
    <div class="map-layout"><div class="map-scroll" tabindex="0" role="region" aria-label="План школы, прокручиваемая область" hidden>
      ${schoolMap()}
    </div>
    <aside id="map-events" aria-label="События на карте"></aside></div>
    <p class="small muted map-unplaced" hidden></p>
    <dialog class="map-event-picker" aria-labelledby="map-picker-title">
      <div class="dialog-heading">
        <h2 id="map-picker-title">События у этой точки</h2>
        <form method="dialog"><button class="plain" aria-label="Закрыть">×</button></form>
      </div>
      <div class="map-picker-events"></div>
    </dialog>
  </section>`;

  const page = content.firstElementChild;
  const status = page.querySelector('#map-message');

  try {
    const [rooms, mapEvents] = await Promise.all([
      loadSchoolRooms(),
      fetch('/api/events').then(response => {
        if (!response.ok) throw new Error('Не удалось загрузить события для карты.');
        return response.json();
      })
    ]);
    if (location.hash !== hash || !page.isConnected) return;

    let focused = mapEvents.find(event => event.id === focusedId);
    if (focusedId && !focused) {
      const response = await fetch(`/api/events/${focusedId}`);
      if (response.ok) { focused = await response.json(); mapEvents.push(focused); }
      if (location.hash !== hash || !page.isConnected) return;
    }
    const roomsByName = new Map(rooms.map(room => [normalizeRoom(room.name), room]));
    const eventsByFloor = [[], [], [], []];
    const unplacedEvents = [];
    let unplaced = 0;
    for (const event of mapEvents) {
      const room = roomsByName.get(normalizeRoom(event.room));
      if (room) {
        eventsByFloor[room.floor].push({event, ...roomPosition(room)});
      } else {
        unplaced += 1;
        unplacedEvents.push(event);
      }
    }

    const select = page.querySelector('#map-floor');
    const zoom = page.querySelector('#map-zoom');
    const zoomLabel = page.querySelector('#map-zoom-label');
    const zoomOut = page.querySelector('#map-zoom-out');
    const zoomIn = page.querySelector('#map-zoom-in');
    const map = page.querySelector('.school-map');
    const pins = page.querySelector('.map-pins');
    const scroll = page.querySelector('.map-scroll');
    const picker = page.querySelector('.map-event-picker');
    const pickerEvents = page.querySelector('.map-picker-events');
    const unplacedNote = page.querySelector('.map-unplaced');

    select.innerHTML = eventsByFloor.map((floorEvents, floor) =>
      `<option value="${floor}">${floor} (${floorEvents.length})</option>`
    ).join('');
    const firstOccupiedFloor = eventsByFloor.findIndex(floorEvents => floorEvents.length);
    const defaultFloor = eventsByFloor[2].length || firstOccupiedFloor === -1 ? 2 : firstOccupiedFloor;
    const focusedRoom = focused && roomsByName.get(normalizeRoom(focused.room));
    select.value = focusedRoom ? focusedRoom.floor : (selectedMapFloor ?? defaultFloor);
    if (unplaced) {
      unplacedNote.hidden = false;
      unplacedNote.textContent = `Событий без точки на плане: ${unplaced}. Их можно открыть в списке событий.`;
    }
    page.querySelector('.map-controls').hidden = false;
    scroll.hidden = false;

    let groups = [];
    function drawPins() {
      groups = [];
      const visible = eventsByFloor[Number(select.value)];
      const {clientWidth: width, clientHeight: height} = map;
      if (!width || !height) return;

      // Group pins that would overlap at this zoom, including events in the same room.
      for (const marker of visible) {
        const group = groups.find(point =>
          Math.hypot((point.x - marker.x) * width, (point.y - marker.y) * height) < 30
        );
        if (group) {
          group.events.push(marker.event);
        } else {
          groups.push({x: marker.x, y: marker.y, events: [marker.event]});
        }
      }

      pins.innerHTML = groups.map((group, index) => {
        const position = pinPosition(group);
        const focusedClass = group.events.some(event => event.id === focusedId) ? " focused-pin" : "";
        const [event] = group.events;
        if (group.events.length === 1) {
          const title = escapeHtml(event.title);
          return `<a class="map-pin${focusedClass}" href="#event/${event.id}" title="${title}" aria-label="${title}" style="${position}"></a>`;
        }

        const label = `Событий у этой точки: ${group.events.length}`;
        return `<button class="map-pin${focusedClass}" type="button" data-group="${index}" style="${position}"
          aria-label="${label}" aria-haspopup="dialog" title="${label}">${group.events.length}</button>`;
      }).join('');
    }

    pins.onclick = click => {
      const button = click.target.closest('[data-group]');
      if (!button) return;
      pickerEvents.innerHTML = groups[Number(button.dataset.group)].events.map(event => `
        <a href="#event/${event.id}">${escapeHtml(event.title)}
          <small>${escapeHtml(event.room)} · ${dateLabel(event.date)} · ${escapeHtml(event.time)}</small>
        </a>`).join('');
      picker.showModal();
    };
    pickerEvents.onclick = click => {
      if (click.target.closest('a')) picker.close();
    };

    function applyZoom(value) {
      const next = Math.max(50, Math.min(300, value));
      const centerX = (scroll.scrollLeft + scroll.clientWidth / 2) / (map.offsetWidth || 1);
      const centerY = (scroll.scrollTop + scroll.clientHeight / 2) / (map.offsetHeight || 1);
      zoom.value = next;
      map.style.width = `${next}%`;
      zoomLabel.textContent = `${next}%`;
      zoomOut.disabled = next === 50;
      zoomIn.disabled = next === 300;
      scroll.scrollLeft = centerX * map.offsetWidth - scroll.clientWidth / 2;
      scroll.scrollTop = centerY * map.offsetHeight - scroll.clientHeight / 2;
    }

    function drawFloor() {
      const floor = Number(select.value);
      status.textContent = eventsByFloor[floor].length ? '' : 'На этом этаже пока нет событий.';
      setSchoolFloor(map, floor, status);
      drawPins();
      scroll.scrollTo(0, 0);
      const link = event => `<p><a href="#event/${event.id}">${escapeHtml(event.title)}</a><br><small>${escapeHtml(event.room)} · ${dateLabel(event.date)} · ${escapeHtml(event.time)}</small></p>`;
      page.querySelector('#map-events').innerHTML = `<h2>На этаже</h2>${eventsByFloor[floor].map(marker => link(marker.event)).join('') || '<p>Нет событий на этом этаже.</p>'}${unplacedEvents.length ? '<h2>Без точки на карте</h2>' + unplacedEvents.map(link).join('') : ''}`;
    }

    zoom.oninput = () => applyZoom(Number(zoom.value));
    zoomIn.onclick = () => applyZoom(Number(zoom.value) + 25);
    zoomOut.onclick = () => applyZoom(Number(zoom.value) - 25);
    page.querySelector('#map-zoom-reset').onclick = () => {
      applyZoom(100);
      scroll.scrollTo(0, 0);
    };
    select.onchange = () => {
      selectedMapFloor = Number(select.value);
      drawFloor();
    };
    mapResizeObserver = new ResizeObserver(drawPins);
    mapResizeObserver.observe(map);
    drawFloor();
  } catch (error) {
    status.textContent = error.message;
  }
}


async function readResponse(response) {
  const data = await response.json().catch(() => null);
  if (!data) throw new Error(`Сервер вернул ошибку (${response.status}). Попробуйте снова позже.`);
  return data;
}
function loadRooms() { return loadSchoolRooms(); }
function findSchoolRoom(rooms, name) {
  return rooms.find(room => normalizeRoom(room.name) === normalizeRoom(name));
}
function roomMapMarkup(room, compact = false) {
  room = {...room, x: room.marker_x ?? room.x, y: room.marker_y ?? room.y};
  const w = room.reference_width * (compact ? 0.32 : 0.48);
  const h = w * 0.56;
  const x = Math.max(0, Math.min(room.reference_width-w, room.x-w/2));
  const y = Math.max(0, Math.min(room.reference_height-h, room.y-h/2));
  const radius = Math.min(room.reference_width, room.reference_height) * 0.0045;
  return `<div class="room-map-preview"><svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="Кабинет ${escapeHtml(room.name)}, этаж ${room.floor}">
    <image href="/static/maps/floor_${room.floor}.png" width="${room.reference_width}" height="${room.reference_height}"/>
    <circle cx="${room.x}" cy="${room.y}" r="${radius*1.8}" fill="#fff" fill-opacity="0.8"/>
    <circle cx="${room.x}" cy="${room.y}" r="${radius}" fill="#a43e25" stroke="#fff" stroke-width="${radius/4}"/>
    </svg><span class="map-caption">📍 ${escapeHtml(room.name)} · этаж ${room.floor}</span></div>`;
}
async function eventLocationCard(event, host) {
  try {
    const rooms = await loadRooms();
    if (!host.isConnected) return;
    const room = findSchoolRoom(rooms,event.room);
    host.innerHTML = `<h2>Место на карте</h2>${room ? roomMapMarkup(room) : `<p>${escapeHtml(event.place)} · ${escapeHtml(event.room)}</p><p class="muted">Для этого места точка на школьном плане не найдена. Уточните место у организатора.</p>`}
      <a class="secondary" href="${event.id ? '#map/'+event.id : '#map'}">Открыть карту школы</a>
      ${room ? '<details class="event-location"><summary>План этажа целиком</summary><p data-map-status role="status">Загружаем план…</p></details>' : ''}`;
    if (room) loadEventLocation(host.querySelector('.event-location'), event.room);
  } catch {
    if (host.isConnected) host.innerHTML = '<h2>Место на карте</h2><p class="muted">План временно недоступен. Попробуйте открыть карту ещё раз.</p><a href="#map">Карта школы</a>';
  }
}
