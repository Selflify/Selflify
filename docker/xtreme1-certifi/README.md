# Обновление certifi в старом Xtreme1

Эти образы относятся к отдельному стеку Xtreme1 на сервере Selflify. Панель Selflify не меняется. images.json закрепляет фактически развёрнутые исходные образы по digest. Dockerfile обновляет только certifi до 2026.10.23 с проверкой SHA-256 wheel. verify_certifi.py проверяет импортированную версию, полный bundle hash, удалённые CA и по флагу --https обычный HTTPS-запрос.

Собирать каждый образ из этого каталога с --build-arg BASE_IMAGE из images.json и отдельным тегом selflify/xtreme1-<service>:certifi-2026.10.23. Перед переключением проверить образ командой python3 /opt/security-certifi/verify_certifi.py --https.

Обновление выполняется в фактическом /opt/xtreme1/compose/docker-compose.yaml: заменить только image для backend, image-vect-visualization и pcd-tools. До изменения сохранить серверную копию Compose и приватные rollback-снимки контейнеров; исходные образы не удалять. Пересоздавать только эти три сервиса через up -d --no-deps. MySQL, Redis, MinIO, nginx и панель не пересоздавать. Секреты из работающего Compose в репозиторий не копировать.

После обновления проверить версии и HTTPS в работающих Python, существующий health backend, запуск sidecar и сохранение MPTCP=0. Сравнить ID остальных контейнеров. При обновлении Xtreme1 из upstream заново применить эти закреплённые производные образы, пока upstream не поставляет проверенный bundle; простое возвращение старых тегов отменяет исправление.
