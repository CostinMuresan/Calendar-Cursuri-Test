# Programator Cursuri

Aplicație web de calendar pentru programarea cursurilor: vizualizare lunară și săptămânală
(tip Gantt, cu săptămâni stivuite), listă de săli/traineri administrabilă, verificare automată
a suprapunerii sălilor și trainerilor, culori personalizabile pe bare, și rapoarte descărcabile
în PDF/Excel.

- **Frontend**: React + Vite, găzduit static pe GitHub Pages
- **Backend**: Supabase (autentificare email+parolă, bază de date Postgres, RLS)

Nu există înregistrare din aplicație — toți userii sunt creați direct din Supabase (vezi Pasul 1).

Acest ghid presupune că pornești **de la zero**, cu un cont GitHub și un cont Supabase noi.

---

## PASUL 1 — Configurare Supabase

1. Creează cont pe [supabase.com](https://supabase.com) → **New project**.
2. În proiectul nou, mergi la **SQL Editor → New query**, lipește tot conținutul fișierului
   [`supabase/schema.sql`](supabase/schema.sql) din acest proiect și rulează-l (buton **Run**).
   Acest script creează tot ce e nevoie: tabelele (`profiles`, `trainers`, `rooms`, `courses`),
   regulile de securitate (RLS), verificarea automată a suprapunerii sălilor/trainerilor
   (inclusiv garanția de nivel bază de date), și populează listele de traineri/săli cu datele
   din Excelul inițial.
3. Mergi la **Project Settings → API** și copiază două valori — le folosești la Pasul 3 și 6:
   - **Project URL**
   - **anon public key**

### Cum creezi utilizatori

1. **Authentication → Users → Add user → Create new user**.
2. Completezi email și parolă, bifezi **Auto Confirm User** (ca userul să poată intra imediat).
3. **Create user**. Se creează automat un rând în `profiles`, cu rol implicit `user`.
4. Trimiți userului email-ul și parola.

### Cum faci un user admin

Adminul poate edita listele de săli și traineri. În Supabase → **SQL Editor**:
```sql
update public.profiles set role = 'admin' where email = 'adresa@exemplu.com';
```

---

## PASUL 2 — Creează repository-ul pe GitHub

1. [github.com](https://github.com) → **New repository**.
2. Alege un nume — reține-l exact, ai nevoie de el la Pasul 3.
3. Public sau Private (Private necesită GitHub Pro ca să funcționeze cu Pages — dacă nu ești
   sigur, alege Public).
4. **Nu** bifa "Add a README file". **Create repository**.

---

## PASUL 3 — Ajustează `vite.config.js` cu numele repo-ului tău

Pe calculator, deschide `vite.config.js` cu Notepad și modifică linia `base`, cu numele exact
al repo-ului de la Pasul 2, cu `/` la început și sfârșit:
```js
base: '/numele-repo-ului-tau/',
```
Salvează.

---

## PASUL 4 — Încarcă proiectul pe GitHub (din browser)

1. Pe pagina repo-ului gol → **"uploading an existing file"** (sau **Add file → Upload files**).
2. Deschide folderul `course-scheduler` pe calculator, selectează **tot** (Ctrl+A), **în afară de**:
   - `node_modules`, dacă există
   - `.env`, dacă l-ai creat (conține cheile tale — nu se urcă niciodată pe GitHub)
3. Trage totul (drag & drop) în zona de upload — inclusiv folderul `.github` (cu punct, e normal).
4. Scrie un mesaj la **Commit changes** și apasă butonul verde.

**Atenție la o capcană întâlnită anterior**: dacă tragi doar conținutul din interiorul
folderului `.github` (nu folderul `.github` însuși), fișierele ajung greșit la rădăcină
(`workflows/deploy.yml` în loc de `.github/workflows/deploy.yml`) și GitHub nu le recunoaște.
Dacă se întâmplă asta, cel mai simplu e să creezi manual fișierul: **Add file → Create new
file**, scrii ca nume exact `.github/workflows/deploy.yml` (GitHub creează singur folderele),
și lipești conținutul din `.github/workflows/deploy.yml` al acestui proiect.

---

## PASUL 5 — Activează publicarea automată (GitHub Pages)

**Settings → Pages** → *Build and deployment → Source* → **GitHub Actions**.

---

## PASUL 6 — Adaugă cheile Supabase ca secrete GitHub

**Settings → Secrets and variables → Actions → New repository secret**, adaugi două:

| Nume secret | Valoare |
|---|---|
| `VITE_SUPABASE_URL` | Project URL, de la Pasul 1 |
| `VITE_SUPABASE_ANON_KEY` | anon public key, de la Pasul 1 |

*(Cheia `anon` e făcută să fie publică — protecția reală vine din regulile RLS din
`schema.sql`, nu din secretizarea acestei chei. Vezi și nota despre securitate mai jos.)*

---

## PASUL 7 — Verifică publicarea

**Actions** → workflow-ul **"Deploy pe GitHub Pages"** ar trebui să ruleze cu bifă verde
(1-2 minute). Aplicația e apoi live la:
```
https://<user-ul-tau-github>.github.io/<numele-repo>/
```

---

## PASUL 8 — Testare locală (opțional)

```
npm install
copy .env.example .env
```
Pui în `.env` (Notepad) Project URL + anon key din Supabase, apoi:
```
npm run dev
```
Aplicația pornește la `http://localhost:5173`.

---

## PASUL 9 — Backup automat pe email (opțional)

Aplicația poate trimite periodic, automat, tot calendarul ca fișier Excel, pe email — cu
frecvența (zilnic/săptămânal/lunar) și adresa aleasă de admin, direct din aplicație (**Administrare
→ Backup automat**). Configurarea de mai jos e o singură dată.

### Configurare Brevo (serviciu gratuit de trimitere email)

1. Cont gratuit pe [brevo.com](https://www.brevo.com).
2. **Senders, Domains & Dedicated IPs → Senders** → adaugi adresa de la care va părea trimis
   backup-ul, confirmi prin email-ul primit.
3. **SMTP & API → API Keys** → generezi o cheie nouă, o copiezi (nu mai poate fi văzută ulterior).

### Secrete noi în GitHub

**Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valoare |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role key** (⚠️ acces complet la baza de date — doar aici, ca secret GitHub, niciodată în `.env`) |
| `BREVO_API_KEY` | Din Brevo |
| `BREVO_SENDER_EMAIL` | Adresa confirmată în Brevo |

*(`VITE_SUPABASE_URL` e deja configurat de la Pasul 6 — workflow-ul de backup îl refolosește.)*

### Setare frecvență și adresă (din aplicație, nu din GitHub)

**Administrare → Backup automat** → alegi frecvența și adresa (adresele) destinatar → **Salvează**.
Nu mai e nevoie să atingi GitHub pentru asta niciodată — doar la configurarea inițială de mai sus.

### Testare imediată

Repo → tab **Actions** → workflow-ul **"Backup calendar (xlsx pe email)"** → **Run workflow**.
Rularea manuală trimite backup-ul imediat, indiferent de frecvența setată, ca să confirmi rapid
că totul funcționează.

---

## Cum funcționează aplicația

### Calendar
- **Vizualizare lunară**: grilă clasică, cursurile afișate cronologic pe zi. Click pe zonă
  liberă = adăugare curs cu data precompletată. Maxim 3 cursuri vizibile pe zi, restul sub
  link „+N mai multe".
- **Vizualizare săptămânală (Gantt)**: mai multe săptămâni stivuite vertical, derulare
  continuă (ca într-un Excel), fiecare curs pe rândul lui, bară colorată întinsă pe zilele
  cât durează. Cursurile care se întind pe mai multe săptămâni afișeaza săgeți `◀`/`▶` la
  capete, arătând continuarea.
- Comutator **Lunar / Săptămânal** în bara de sus.
- Treci mouse-ul peste orice curs pentru un rezumat rapid (hover).

### Culori
Trei moduri, alese de fiecare user din **Setări**:
- **Durată** (implicit): albastru (1 zi) → verde (2-3 zile) → portocaliu (4-7 zile) → roșu (>1 săptămână)
- **Responsabil**: fiecare responsabil primește o culoare
- **Categorie curs** (câmpul "Arie curs" din formular)

Culorile implicite sunt generate automat (distincte, dar neasignate manual); fiecare user
poate personaliza orice culoare dintr-un color picker, din **Setări**. Preferințele (mod de
culoare, culori alese, câmpuri afișate pe bara săptămânală) se salvează în contul userului
din Supabase — aceleași pe orice dispozitiv.

### Validări
- **Suprapunere sală/trainer**: blocată la salvare, cu mesaj clar, plus o garanție de nivel
  bază de date (imposibil de ocolit, chiar la salvări simultane).
- **Istoric păstrat**: dezactivarea/ștergerea unei săli sau a unui trainer din listă nu
  afectează cursurile vechi care îl foloseau.

### Roluri
Orice user autentificat vede toate cursurile și poate adăuga cursuri noi; editează/șterge
doar propriile cursuri, cu excepția adminului, care poate orice. Adminul gestionează și
listele de săli/traineri/responsabili, din **Administrare** — unul câte unul, sau prin
import în bloc dintr-un fișier Excel.

### Rapoarte
Filtrare pe interval de date, sală, trainer, tip curs → export PDF sau Excel.

### Backup automat
Export complet, periodic, pe email — vezi Pasul 9 mai sus.

---

## Notă despre securitate (GitHub ↔ Supabase)

Nu există o "comunicare sensibilă" între GitHub și Supabase — GitHub doar găzduiește fișierele
statice ale aplicației; odată încărcate în browser, acestea vorbesc **direct** cu Supabase,
prin HTTPS (criptat). Cheia `anon` folosită în cod e menită să fie publică — orice vizitator
al site-ului o poate vedea în codul paginii, la fel ca la orice aplicație de acest tip. Singura
protecție reală, și cea care contează, sunt regulile RLS din `schema.sql`: fără login valid,
niciun request nu poate citi sau scrie date, indiferent de cheia folosită.

---

## Dezvoltare ulterioară

Revii oricând într-o conversație cu Claude pentru funcționalități noi. Trimite link-ul către
noul repo (sau conectează integrarea GitHub); încarci fișierele actualizate prin aceeași
metodă de upload din browser (Pasul 4).

## Structură proiect

```
├── supabase/schema.sql            # tot ce trebuie rulat in Supabase
├── src/
│   ├── components/
│   │   ├── Calendar/
│   │   │   ├── CalendarPage.jsx   # pagina principala (toggle lunar/saptamanal, stare comuna)
│   │   │   ├── MonthGrid.jsx      # grila lunara (vizual, fara stare)
│   │   │   ├── WeekGrid.jsx       # un bloc saptamanal Gantt (vizual, fara stare)
│   │   │   └── CourseModal.jsx    # formular adaugare/editare curs
│   │   ├── Admin/                 # gestionare liste sali/traineri
│   │   ├── Reports/               # filtrare + export PDF/Excel
│   │   ├── Settings/              # preferinte personale (campuri bara, culori)
│   │   ├── DateInputRO.jsx        # camp de data in format romanesc, cu picker
│   │   ├── Login.jsx
│   │   └── Navbar.jsx
│   ├── contexts/AuthContext.jsx   # sesiune, profil, updatePreferences()
│   ├── utils/                     # culori, date, export PDF/xlsx
│   ├── supabaseClient.js
│   └── App.jsx
└── .github/workflows/deploy.yml   # publicare automata pe push / upload
```
