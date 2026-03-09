# AI Project Generation Task

## 🎯 Project Goal

Read the **project specification PDF** and implement the system strictly according to the **Option 1 requirements** defined in that document.

All algorithms, evaluation metrics, and experimental procedures must follow the **Option 1 specification**. Do not invent alternative tasks or modify the requirements.

The final system should be delivered as a **full-stack web application** that demonstrates the Option 1 solution.

---

## ⚠️ Primary Constraint

The **PDF project specification is the authoritative requirement**.

You must:
- Carefully read the PDF.
- Identify the exact requirements of **Option 1**.
- Implement the system strictly according to those requirements.
- Ensure that the data processing, model training, and evaluation follow the specification.

> **Note:** If there is any conflict between this prompt and the PDF, **the PDF takes priority**.

---

## 📦 Provided Resources

### 1. Dataset
The **MovieLens dataset** is already provided.
```text
dataset/
 └── ml-latest-small/
```

### 2. Reference Implementations
Optional reference implementations are available to help understand the problem, but they **should not be copied directly**.
```text
reference/
```

---

## 🛠️ Technology Stack

| Component | Technology | Notes |
| :--- | :--- | :--- |
| **Language** | Python, TypeScript | Core logic in Python, frontend in TS. |
| **Frontend** | Next.js | Modern React framework. |
| **UI Library** | HeroUI | [https://www.heroui.com/](https://www.heroui.com/) |
| **Backend** | Django | Recommended for REST API delivery. |
| **Database** | Optional | Use in-memory or flat files if sufficient. |

---

## ⚙️ System Requirements

### 1. Data Processing
Load and preprocess the MovieLens dataset. Tasks include:
- Parsing `.dat` / `.csv` files.
- Building the user–item interaction matrix.
- Preparing training and testing datasets.

*The data pipeline must support the training procedure required by **Option 1**.*

### 2. Recommendation Model
Implement the recommendation algorithm required by **Option 1**. The implementation must include:
- Model training.
- Rating prediction.
- Top-N recommendation generation.

*Evaluation metrics must follow those specified in the PDF (e.g., MAE, RMSE, Precision, Recall, NDCG if required).*

### 3. Backend API (Optional but Recommended)
Provide REST endpoints for accessing movies and recommendations. Example endpoints:
- `GET /api/movies`
- `GET /api/movie/{id}`
- `GET /api/recommend/{user_id}`
- `GET /api/search`

*The backend should load the trained model and return recommendation results.*

### 4. Frontend Application
Build a web interface using **Next.js and HeroUI**. Required features:
- **Home page:** Display movie list.
- **Movie detail page:** Show movie metadata and similar recommendations.
- **Recommendation page:** Allow user to input a user ID and display recommended movies.

---

## 🎨 UI Design Guidelines

The web interface must follow a modern, dark-themed, cinematic design language (e.g., Netflix-style):

### Color Palette
- **Background Base:** `#09090b` (Deep dark)
- **Background Surface:** `#18181b` (Slightly elevated dark)
- **Brand / Accent:** `#e50914` (Cinematic red)
- **Text:** `#f8fafc` (Primary text), `#a1a1aa` (Subtle text)
- **Borders:** `rgba(255, 255, 255, 0.1)` (Soft translucent borders)

### Visual Style

- **Glassmorphism & Backgrounds**
  - Use `backdrop-filter: blur(12px)` and semi-transparent dark backgrounds for overlays, navigation bars, and dropdown menus.
- **Typography**
  - Font families: `Inter`, `SF Pro Display`, or system sans-serif. Clean, modern, and highly legible.
- **Shapes & Radii**
  - Consistent rounded corners across components:
    - **Tags / Chips:** `8px`
    - **Cards:** `12px` to `16px`
    - **Dropdown Panels:** `20px`
    - **Buttons & Pills:** Fully rounded (`50%` or `999px`)
- **Hover Effects & Interactions**
  - Use smooth, in-place scaling (`transform: scale(1.05)`), **avoiding** vertical shifting (`translateY`).
  - Highlight movie cards with distinct white borders (`border-color: #ffffff; border-width: 2px;`) and dynamic box shadows.
- **Navigation Bar**
  - **Layout:** Three-column layout. Brand/Logo on the far left, a floating pill-shaped navigation links container (`border-radius: 999px`) in the absolute center (`left: 50%; transform: translateX(-50%)`), and user avatar/actions on the far right.
  - **Container & Effects:** The central link container uses glassmorphism (`backdrop-filter: blur(12px)`, `rgba(255, 255, 255, 0.05)`). A subtle dark gradient vignette mask (e.g., `background: linear-gradient(180deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.6) 40%, transparent 100%); pointer-events: none;`) must be placed behind the entire nav bar at the top of the screen to ensure link readability over varied background images.
  - **Interactions:** Link states transition opacity (`0.7` to `1.0`), and active states use the brand color with bold weight. User avatars should be circular, scale up on hover, and feature a brand-colored outer glow.
- **Component Specifics**
  - **Tags & Chips:** Dark gray (`#323235`) background with `#ffffff` text and no borders.
  - **Buttons & Controls:** Floating UI controls (back buttons, carousel toggles) must be circular, using strong blurs (`blur(12px)`), dark semi-transparent backgrounds, and subtle hover feedback (slight white border, icon shifting).
  - **Form Elements / Selects:** Dropdown menus maintain fixed bounds (e.g., `min-width: 200px`) to prevent stretching, use vertical padding for breathing room, and indicate selection with brand-colored backgrounds and white checkmarks.
  - **Card Content Layout:** Clean metadata combining, such as displaying `Year · Top Genre` compactly below the movie title.

---

## 📁 Suggested Project Structure

```text
movie-recommendation-system/
├── dataset/             # Raw data files
├── reference/           # Provided reference implementations
├── backend/             # Django API
├── frontend/            # Next.js web interface
├── models/              # Model definitions and generated artifacts
├── scripts/             # Scripts for training and data processing
├── README.md            # Project documentation
└── requirements.txt     # Python dependencies
```

---

## 📋 Implementation Plan

1. Read the project PDF and extract the **Option 1 requirements**.
2. Implement the dataset processing pipeline.
3. Implement the recommendation model required by Option 1.
4. Train and evaluate the model according to the PDF metrics.
5. Implement backend APIs to serve the model.
6. Build a Next.js frontend interface using HeroUI.
7. Integrate the full system into a runnable web application.

---

## ✅ Expected Deliverables

The generated project should include:
- [x] Complete project structure.
- [x] Python implementation of the Option 1 model.
- [x] Model training and evaluation scripts.
- [x] Django API backend (if applicable).
- [x] Next.js frontend application.
- [x] Clear `README.md` explaining how to run the system.

**The final system must demonstrate the Option 1 solution described in the project PDF.**