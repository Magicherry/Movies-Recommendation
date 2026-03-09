# AI Project Generation Task

## Project Goal
Read the **project specification PDF** and implement the system strictly according to the **Option 1 requirements** defined in that document.

All algorithms, evaluation metrics, and experimental procedures must follow the **Option 1 specification**. Do not invent alternative tasks or modify the requirements.

The final system should be delivered as a **full-stack web application** that demonstrates the Option 1 solution.

------

## Primary Constraint

The **PDF project specification is the authoritative requirement**.

You must:

- Carefully read the PDF.
- Identify the exact requirements of **Option 1**.
- Implement the system strictly according to those requirements.
- Ensure that the data processing, model training, and evaluation follow the specification.

If there is any conflict between this prompt and the PDF, **the PDF takes priority**.

------

## Provided Resources

### Dataset

The **MovieLens 1M dataset** is already provided.

### Directory structure:

```
dataset/
    ml-latest-small
```

### Reference Implementations

Optional reference implementations are available.

```
reference/
```

These may be used for understanding the problem but should not be copied directly.

------

## Technology Stack

Programming Language
 Python

Frontend
 Next.js

UI Library
 HeroUI
 https://www.heroui.com/

Backend
 Django (optional but recommended)

Database
 Optional

------

## System Requirements

1. Data Processing

Load and preprocess the MovieLens dataset.

Tasks include:

- parsing `.dat` files
- building the user–item interaction matrix
- preparing training and testing datasets

The data pipeline must support the training procedure required by **Option 1**.

------

2. Recommendation Model

Implement the recommendation algorithm required by **Option 1**.

The implementation must include:

- model training
- prediction
- Top-N recommendation generation

Evaluation metrics must follow those specified in the PDF (for example MAE, RMSE, Precision, Recall, NDCG if required).

------

3. Backend API (optional)

Provide REST endpoints for accessing movies and recommendations.

Example endpoints:

```
GET /api/movies
GET /api/movie/{id}
GET /api/recommend/{user_id}
GET /api/search
```

The backend should load the trained model and return recommendation results.

------

4. Frontend Application

Build a web interface using **Next.js and HeroUI**.
Required features:
- Home page: Display movie list.
- Movie detail page: Show movie metadata and similar recommendations.
- Recommendation page: Allow user to input a user ID and display recommended movies.

------

Suggested Project Structure

```
movie-recommendation-system/

dataset/
reference/

backend/
frontend/

models/
scripts/

README.md
requirements.txt
```

------

## Implementation Plan

1. Read the project PDF and extract the **Option 1 requirements**.
2. Implement the dataset processing pipeline.
3. Implement the recommendation model required by Option 1.
4. Train and evaluate the model according to the PDF metrics.
5. Implement backend APIs if needed.
6. Build a Next.js frontend interface.
7. Integrate the full system into a runnable web application.

------

## Expected Deliverables

The generated project should include:

- complete project structure
- Python implementation of the Option 1 model
- model training and evaluation scripts
- optional Django API backend
- Next.js frontend application
- clear README explaining how to run the system

The final system must demonstrate the **Option 1 solution described in the project PDF**.