# Глосарій перекладу адмінки Stalwart (uk)

Головний для форків `NikNikolaenkov/webui` і `NikNikolaenkov/webmail` (копія у webmail підлаштовується під цей).

## Загальні правила

- Стиль: стислі назви, як в інтерфейсах Windows/Google українською. Назви розділів і пунктів меню — іменники в називному відмінку («Облікові записи», «Домени»); кнопки й дії — інфінітив («Створити», «Видалити»).
- Велика літера лише на початку назви й у власних назвах («Політика TLS», не «Політика Tls»).
- Не перекладаються: назви протоколів і стандартів (SMTP, IMAP, JMAP, POP3, LMTP, HTTP, TLS, SSL, DNS, DNSSEC, DANE, MTA-STS, DKIM, SPF, DMARC, ARC, ARF, BIMI, ACME, OAuth, OIDC, LDAP, SQL, Sieve, CalDAV, CardDAV, WebDAV, WebSocket, S/MIME, PGP, TOTP), назви продуктів і сховищ (PostgreSQL, MySQL, SQLite, RocksDB, FoundationDB, Redis, S3, Azure, Elasticsearch, Meilisearch, OpenTelemetry, Prometheus, Let's Encrypt, Stalwart), алгоритми й формати (SHA-256, RSA, Ed25519, ECDSA, JSON, CSV, MIME), коди мов і MIME-типи. У такому разі переклад = оригінал або перекладається лише загальне слово навколо («Сховище PostgreSQL»).
- Одиниці: «байти», «КБ», «МБ», «ГБ», «секунди», «хвилини», «години», «дні».
- Плейсхолдери, змінні в фігурних дужках, `%s`, назви полів у `коді` — без змін.
- Однаковий англійський рядок у різних місцях перекладається однаково.

## Терміни

| English | Українською |
|---|---|
| Account / Accounts | Обліковий запис / Облікові записи |
| User (account) | Користувач |
| Group (account) | Група |
| Individual | Особистий |
| Tenant | Орендар |
| Role | Роль |
| Permission | Дозвіл |
| Principal | Суб'єкт |
| Mailing list | Список розсилки |
| Alias | Псевдонім |
| Domain | Домен |
| Mailbox | Скринька (сховище листів користувача); Тека (IMAP-тека) |
| Folder | Тека |
| Quota | Квота |
| Disk quota | Дискова квота |
| App password | Пароль застосунку |
| API key | Ключ API |
| Credential | Облікові дані |
| Secret | Секрет |
| OAuth client | Клієнт OAuth |
| Application | Застосунок |
| Directory | Каталог |
| Store / Data store / Blob store | Сховище / Сховище даних / Сховище вкладень (blob) |
| Lookup store | Сховище довідників |
| In-memory store | Сховище в пам'яті |
| Search index / Full-text search | Пошуковий індекс / Повнотекстовий пошук |
| Queue / Message queue | Черга / Черга повідомлень |
| Queued message | Повідомлення в черзі |
| Delivery | Доставка |
| Inbound / Outbound | Вхідні / Вихідні (про пошту); Вхідний / Вихідний |
| Relay | Ретрансляція |
| Route / Routing | Маршрут / Маршрутизація |
| Listener | Слухач (мережевий) |
| Bind address | Адреса прослуховування |
| Server / Node / Cluster | Сервер / Вузол / Кластер |
| Certificate | Сертифікат |
| Private key | Закритий ключ |
| Spam filter | Спам-фільтр |
| Spam / Ham | Спам / Не спам |
| Classifier | Класифікатор |
| Training | Навчання |
| Score | Бал |
| Tag (spam) | Тег |
| Rule | Правило |
| Expression | Вираз |
| Condition | Умова |
| Filter | Фільтр |
| Blocklist / Allowlist | Список блокування / Список дозволених |
| Rate limit / Throttle | Обмеження частоти |
| Limit | Обмеження / Ліміт |
| Timeout | Тайм-аут |
| Interval | Інтервал |
| Retry / Retries | Повтор / Повтори |
| Report / Reporting | Звіт / Звітність |
| Aggregate report | Зведений звіт |
| Failure report | Звіт про збої |
| Task / Scheduled task | Задача / Запланована задача |
| Action | Дія |
| Webhook | Вебхук |
| Tracing / Tracer | Трасування / Трасувальник |
| Logs / Logging | Журнал / Журналювання |
| Metrics | Метрики |
| Telemetry | Телеметрія |
| Dashboard | Панель |
| Overview | Огляд |
| Settings | Налаштування |
| Management | Керування |
| General | Загальні |
| Advanced | Додатково |
| Security | Безпека |
| Authentication | Автентифікація |
| Authorization | Авторизація |
| Encryption / Encryption at rest | Шифрування / Шифрування даних на диску |
| Enable / Enabled / Disabled | Увімкнути / Увімкнено / Вимкнено |
| Default | За замовчуванням |
| Name / Description | Назва (для об'єктів) або Ім'я (для людей) / Опис |
| Email address | Адреса ел. пошти |
| Sender / Recipient | Відправник / Одержувач |
| Message | Повідомлення (технічне), Лист (для користувача пошти) |
| Header | Заголовок |
| Body | Тіло |
| Attachment | Вкладення |
| Size | Розмір |
| Created / Updated | Створено / Оновлено |
| Status | Стан |
| Type | Тип |
| Value | Значення |
| Key | Ключ |
| Host / Hostname | Хост / Ім'я хоста |
| Port | Порт |
| Protocol | Протокол |
| Address | Адреса |
| Proxy | Проксі |
| Cache | Кеш |
| Calendar / Address book / Contact | Календар / Адресна книга / Контакт |
| Event / Scheduling | Подія / Планування |
| Files | Файли |
| Sharing / Shared | Спільний доступ / Спільний |
| Vacation response | Автовідповідь |
| Sieve script | Сценарій Sieve |
| Archive / Archiving | Архів / Архівування |
| Restore | Відновити |
| Backup | Резервна копія |
| Import / Export | Імпорт / Експорт |
| Live | У реальному часі |
| Enterprise | Enterprise (без перекладу) |
