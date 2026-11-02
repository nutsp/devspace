# ติดตั้ง Devspace บนเครื่องใหม่

คู่มือนี้ติดตั้ง source จาก repo นี้พร้อม Work, Wiki, Timesheet, Milestones, Mermaid/PlantUML และ MCP แบบอ่านอย่างเดียว ไม่ต้องมีไฟล์ build หรือ credentials จากเครื่อง demo เดิม

## 1. เตรียมเครื่อง

- Git, Docker Engine/Desktop พร้อม BuildKit และ Docker Compose v2.30 ขึ้นไป (`docker compose version`)
- Python 3.10 ขึ้นไป สำหรับสร้างไฟล์ env แบบสุ่ม secrets ไม่ต้องติดตั้ง Node หรือ pnpm บน host
- แนะนำ RAM อย่างน้อย 8 GB และพื้นที่ว่างอย่างน้อย 20 GB; การ build ครั้งแรกใช้ทรัพยากรมากกว่าการรันปกติ
- เชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลด base images และ dependencies
- พอร์ต 8089 ต้องว่าง หากมี Plane เดิมอยู่แล้ว ให้เลือกพอร์ตอื่นและ Compose project name อื่น อย่านำ volumes เดิมมาใช้โดยไม่สำรองข้อมูล

```sh
git clone git@github.com:nutsp/devspace.git
cd devspace
python3 deploy/devspace/configure.py
```

คำสั่งสุดท้ายสร้าง `deploy/devspace/devspace.env` สิทธิ์ไฟล์ 600 พร้อม secrets ที่สุ่มแยกกัน และจะไม่เขียนทับไฟล์ที่มีอยู่แล้ว ไม่แสดง secrets บน terminal

`deploy/devspace/env.example` เป็นแบบฟอร์มที่ไม่มี credentials จริง หากคัดลอกเอง ต้องเติมทุกช่อง secret ก่อน Compose จะยอมเริ่มระบบ ใช้ค่า hex หรืออักษร/ตัวเลขสำหรับรหัสผ่าน DB/MQ เพื่อไม่ต้อง URL-encode ใน connection URLs

## 2. ตั้ง URL และ build

ค่าเริ่มต้นเปิดเฉพาะเครื่องตัวเอง: `http://localhost:8089` และ bind `127.0.0.1`

ถ้าทดสอบจากเครื่องอื่นใน LAN ให้แก้ใน `devspace.env`:

```dotenv
DEVSPACE_BIND=0.0.0.0
DEVSPACE_PORT=8089
WEB_URL=http://SERVER_IP:8089
CORS_ALLOWED_ORIGINS=http://SERVER_IP:8089
```

เปลี่ยน `SERVER_IP` เป็น IP/ชื่อเครื่องจริง `WEB_URL` คือ URL ที่ผู้ใช้เปิดจาก browser จึงห้ามใช้ `localhost` สำหรับผู้ใช้จากเครื่องอื่น

`WEB_URL` ยังถูกส่งเข้า Web build เพื่อสร้าง Open Graph/Twitter preview เป็น URL ของเครื่องที่ติดตั้ง หากเปลี่ยนโดเมนภายหลัง ให้ build และ recreate เฉพาะ Web ใหม่ด้วย (`./deploy/devspace/devspace build web` แล้ว `./deploy/devspace/devspace up -d --no-deps web`)

สำหรับใช้งานจริง ให้ตั้ง reverse proxy ด้านหน้าพอร์ตนี้พร้อม HTTPS/WebSocket แล้วเปลี่ยน `WEB_URL` และ CORS เป็น HTTPS origin เดียวกัน เช่น `https://devspace.example.com` คง bind เป็น loopback ถ้า reverse proxy อยู่เครื่องเดียวกัน การตั้งโดเมนอย่างเดียวไม่ได้ทำให้ Compose ชุดนี้ออก certificate อัตโนมัติ

```sh
./deploy/devspace/devspace config --quiet
./deploy/devspace/devspace build web
./deploy/devspace/devspace build live
./deploy/devspace/devspace build api
./deploy/devspace/devspace up -d
./deploy/devspace/devspace ps -a
./deploy/devspace/devspace logs --tail=100 migrator api
```

ใช้ `config --quiet` เพื่อตรวจโครงสร้างโดยไม่พิมพ์ secrets build ทีละ service ตามตัวอย่างเพื่อลดการใช้ทรัพยากรพร้อมกัน

- Web และ Live build จาก source เดียวกันใน Docker รวม shared editor ที่ต้องใช้กับ Mermaid/PlantUML
- API/worker/beat/migrator ใช้ backend custom image เดียวกัน
- Migrator รอ DB/Redis/MQ พร้อมและทำ migrations; API เริ่มเมื่อ migrator สำเร็จ
- PostgreSQL, Redis, RabbitMQ และ uploads เก็บใน named volumes ของ project `devspace`
- เปิด host port เฉพาะ proxy; DB/Redis/MQ/MinIO/PlantUML ไม่มี host port
- PlantUML อยู่ใน internal network แยก มี SANDBOX และจำกัด RAM/CPU; API เข้าถึง renderer ได้

รอ API log แสดง Gunicorn พร้อมรับงาน แล้วเปิด URL ที่ตั้งไว้ ขั้นตอนแรกไป `/god-mode/` เพื่อสร้าง instance administrator และตั้งค่า instance จากนั้นเปิดหน้าหลัก สร้างบัญชี/workspace/projects ตาม flow ของ Plane หน้านี้ไม่สร้าง demo users, projects หรือ API tokens ให้อัตโนมัติ

SMTP, external SSO และ HTTPS ภายนอกต้องตั้งแยกตามสภาพแวดล้อม ส่วน UI ที่พัฒนาต่อใช้ภาษาและธีมจาก Plane เดิม

## 3. ตรวจหลังติดตั้ง

1. สร้าง workspace และ project พร้อม work item ทดลอง
2. เข้า Wiki สร้าง Collection และ nested Page; พิมพ์ข้อความ รอ autosave แล้ว reload เพื่อตรวจว่าเก็บข้อมูลจริง
3. สร้าง Mermaid และ PlantUML ผ่านเมนู editor สลับ Code/Preview และทดลอง Dark mode
4. ค้นคำในเนื้อหาจาก Wiki Library แล้วเปิดผลค้นหา
5. ตั้ง Project Lead ใน Project Settings ก่อนส่ง Timesheet; แต่ละ Lead อนุมัติเฉพาะ project ของตนเอง และ Lead อนุมัติเวลาของตัวเองได้ตาม workflow ปัจจุบัน
6. สร้าง Milestone ตั้ง target date และผูก work item ตรวจทั้ง Overview และ Timeline

## 4. ติดตั้ง MCP แบบอ่านอย่างเดียว

MCP นี้ใช้ **stdio** สำหรับ desktop/CLI client ไม่มี HTTP/SSE endpoint และไม่เปิด host port ให้รัน client บนเครื่องเดียวกับ Docker deployment หรือใช้โหมด host Python ด้านล่างเพื่อเชื่อมไปยัง server ผ่าน HTTPS

### เตรียมบัญชีและ tokens

- Work ใช้ token ของบัญชี reader ที่มีสิทธิ์อ่าน projects ที่ต้องการเท่านั้น หากเป็น Guest ผลงานอาจไม่ครบทั้งทีมตามกติกาของ Plane
- Wiki/Timesheet/Milestones ใช้ token แยกของบัญชีที่เจ้าของระบบอนุญาต เช่น PM/Project Lead ไม่จำเป็นต้องเพิ่ม role
- สร้าง Personal Access Token ของแต่ละบัญชีจาก Preferences → Personal Access Tokens และเลือก workspace ให้ถูกต้อง
- Timesheet อ่านได้เฉพาะของบัญชีนั้นเอง และส่วนที่บัญชีนั้นเป็น Lead/ผู้ตรวจตามสถานะงาน สิทธิ์ Admin ไม่ได้ทำให้เห็น Timesheet ทุกคน
- API tokens เป็น credentials ที่สามารถถูกนำไปใช้นอก MCP ได้ด้วย เก็บไฟล์ private และใช้บัญชีสิทธิ์ต่ำสุดที่เพียงพอ MCP adapter ปิด write tools แต่ไม่ได้เปลี่ยน API token ให้เป็น token อ่านอย่างเดียวใน Plane

```sh
cp integrations/mcp/env.example integrations/mcp/mcp.env
chmod 600 integrations/mcp/mcp.env
./deploy/devspace/devspace build mcp
```

แก้ `integrations/mcp/mcp.env` แบบ private:

| ตัวแปร                    | ค่า                                                                       |
| ------------------------- | ------------------------------------------------------------------------- |
| `DEVSPACE_URL`            | Public browser origin เดียวกับ WEB_URL ไม่มี path ปิดท้าย                 |
| `DEVSPACE_WORKSPACE_SLUG` | slug ใน URL ของ workspace                                                 |
| `DEVSPACE_WORK_API_KEY`   | token ของ Work reader                                                     |
| `DEVSPACE_PROJECT_IDS`    | UUID ของ Work/Milestone projects คั่นด้วย comma ต้องไม่ว่าง               |
| `DEVSPACE_DOCS_API_KEY`   | token ของบัญชี Wiki/Timesheet/Milestone reader                            |
| `DEVSPACE_DOCS_USER_ID`   | user UUID ของบัญชีที่เป็นเจ้าของ docs token ใช้ตรวจ identity ของ response |
| `DEVSPACE_API_URL`        | เว้นว่างเมื่อรันบน host; Compose กำหนด `http://api:8000` ให้เอง           |

ยังไม่รู้ UUID ให้เติม URL, slug และ tokens ก่อน แล้วใช้ GET-only helper:

```sh
./deploy/devspace/devspace run --rm --no-deps -T --entrypoint python mcp /app/setup_info.py
```

helper แสดงเฉพาะ user UUID และ project identifiers/UUIDs ที่ Work reader มองเห็น ไม่พิมพ์ token เลือก UUIDs ที่อนุญาตลง `DEVSPACE_PROJECT_IDS` และ user UUID ลง `DEVSPACE_DOCS_USER_ID` แล้วทดสอบ:

```sh
./deploy/devspace/devspace run --rm --no-deps -T --entrypoint python mcp /app/run_tests.py
./deploy/devspace/devspace run --rm --no-deps -T --entrypoint python mcp /app/smoke.py
```

ชุดแรกใช้ synthetic fixtures ไม่เรียก server; ชุดที่สองเปิด stdio server แล้วอ่าน identities/projects/Wiki/Timesheet/Milestones ให้ครบทุกหน้าพร้อมตรวจว่าปฏิเสธ write action ได้ จำนวน 0 ไม่ใช่ข้อผิดพลาดหากไม่มีข้อมูลที่บัญชีนั้นมองเห็น

### เชื่อมกับ MCP client

ดู `integrations/mcp/codex.example.toml` หรือ `integrations/mcp/client.example.json` แล้วเปลี่ยน absolute paths ให้ตรงเครื่องจริง Tokens อยู่ใน `mcp.env` ไม่ต้องฝังลง config ของ client อย่าใช้ `up mcp` เป็น daemon ให้ client เรียก `compose run --rm --no-deps -T mcp` ตามตัวอย่าง เมื่อเปลี่ยน env ให้ reconnect MCP client

ตัวอย่างคำขอ AI: “สรุป Milestones พร้อมงานค้าง/เกินกำหนด อ่านให้ครบทุกหน้า และอ้างอิงลิงก์ต้นทาง” ให้ AI ใช้ connection Devspace นี้โดยตรง ไม่ใช้ Plane connection อื่น

tools มี 13 ตัว: project, workitem, state, label, member, cycle, module, workitem_comment, workitem_activity, workitem_link, wiki, timesheet, milestone ไม่มี submit/approve/edit/delete tools ไม่มี PQL

Work enumeration/search ยังคงจำกัดด้วยสิทธิ์บัญชี Work reader; `project_id` ที่ส่งเข้า tool และ Milestone portfolio ถูกตรวจเทียบ configured project IDs เสมอ จึงควรจำกัดสมาชิกของ Work reader ให้ตรงกับ scope ที่ตั้ง ไม่ใช้ token ของผู้มีสิทธิ์ทุก project แทน reader

### MCP client อยู่คนละเครื่องกับ server

ติดตั้ง Python 3.12 และ dependencies ใน virtualenv บนเครื่องที่รัน client:

```sh
python3.12 -m venv integrations/mcp/.venv
integrations/mcp/.venv/bin/pip install -r integrations/mcp/requirements.txt
```

ใช้ `DEVSPACE_URL=https://YOUR_SERVER` และเว้น `DEVSPACE_API_URL` เพื่อใช้ public URL นำตัวแปรใน `mcp.env` เข้า environment ของ process ด้วยตัวจัดการ secrets หรือ shell แล้วตั้ง client command เป็น absolute path ของ `.venv/bin/python` และ args เป็น absolute path ของ `server.py` ไฟล์ env ตัวอย่างไม่มี syntax shell command; หากเลือก `set -a; . ./integrations/mcp/mcp.env; set +a` ให้ source เฉพาะไฟล์ที่ตนเองตรวจสอบแล้ว

## 5. หยุด เริ่ม และอัปเกรด

```sh
./deploy/devspace/devspace stop
./deploy/devspace/devspace up -d
# ก่อน upgrade: สำรองข้อมูลตามหัวข้อถัดไป แล้วจึง
./deploy/devspace/devspace stop proxy api worker beat-worker live
git pull --ff-only
./deploy/devspace/devspace build web
./deploy/devspace/devspace build live
./deploy/devspace/devspace build api
./deploy/devspace/devspace build mcp
./deploy/devspace/devspace run --rm migrator
./deploy/devspace/devspace up -d
```

อย่าใช้ `down -v` กับข้อมูลที่ต้องเก็บ และอย่าเปลี่ยน Compose project name หลังเริ่มใช้งาน เพราะจะสร้าง volumes อีกชุด `migrator` ต้องรันจนสำเร็จเมื่อมี migration ใหม่ก่อนเปิด API version ใหม่ การ rollback ข้าม schema ต้องใช้ source version กับ DB/uploads/env backup ที่ตรงกัน

## 6. สำรองและกู้คืน

สำรอง DB, uploads และไฟล์ env ทั้งสองชุด เก็บ env ในที่เข้ารหัส/สิทธิ์จำกัดนอก Git หยุดผู้เขียนเพื่อให้ DB และไฟล์ตรงกัน:

```sh
mkdir -p backups
chmod 700 backups
./deploy/devspace/devspace stop proxy api worker beat-worker live
./deploy/devspace/devspace exec -T plane-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/database.dump
./deploy/devspace/devspace run --rm --no-deps -T backup > backups/uploads.tgz
./deploy/devspace/devspace up -d
```

ตรวจว่า backup files ไม่ว่าง และทดลอง restore ใน **เครื่อง/project ใหม่ที่ยังไม่มีข้อมูล** อย่าทดลองทับ demo เดิม:

1. checkout commit เดียวกับ backup และคืนไฟล์ `devspace.env`/`mcp.env` แบบ private พร้อมปรับ URL สำหรับเครื่องใหม่
2. build images และ start เฉพาะ `plane-db`, `plane-redis`, `plane-mq`, `plane-minio` รอ DB healthy
3. restore DB และ uploads ใน project ใหม่ (คำสั่ง tar ใช้ชื่อ volume ของ project ค่าเริ่มต้น `devspace`):

```sh
./deploy/devspace/devspace exec -T plane-db sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/database.dump
docker run --rm -i --mount type=volume,source=devspace_uploads,target=/data alpine:3.21 tar -C /data -xzf - < backups/uploads.tgz
./deploy/devspace/devspace up -d
```

ถ้า restore project ชื่ออื่น ให้เปลี่ยน volume name ให้ตรงก่อนรัน ตรวจ login, เอกสารพร้อมไฟล์แนบ, Timesheet และ MCP อีกครั้ง ไม่เปิดเผย backup หรือ env ผ่าน repo Public

## 7. แก้ปัญหา

- Compose บอก secret ว่าง: สร้าง/เติม `devspace.env`; อย่าแก้ YAML ให้ข้าม validation
- `migrator` exit ไม่สำเร็จ: ดู logs DB/migrator และรันใหม่หลังแก้สาเหตุ ไม่ลบ volume เพื่อแก้ migration
- Preview PlantUML ไม่ขึ้น: ตรวจ `plantuml` logs และ API; renderer ไม่ต้องเปิดพอร์ต host
- Editor ไม่ autosave: ตรวจ Live/WebSocket และ reverse proxy `/live`; WEB_URL/CORS ต้องตรง origin ที่ browser ใช้
- MCP ไม่เริ่ม: ดู stderr ของ client ตรวจ env ครบ UUIDs ถูก และ build mcp ใหม่หลัง source เปลี่ยน
- MCP HTTP 401/403: ตรวจ token หมดอายุ/workspace/บัญชีถูกถอดสิทธิ์ ไม่แก้ด้วยการเลื่อน role อัตโนมัติ
- Docker build ใช้ RAM สูง: build ทีละ service แยกคำสั่งตามตัวอย่าง; เพิ่ม resource ของ Docker Desktop ตามเครื่อง
- อย่าโพสต์ output ของ `docker compose config` แบบเต็มหรือ `docker inspect` ที่มี env เพราะมี secrets
