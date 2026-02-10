---
name: game_account_management
description: Skill to manage game accounts, track daily tasks, and handle check-ins.
---

# Game Account Management Skill

This skill allows the Agent to help the user manage multiple game accounts, track daily repetitive tasks, and ensure daily check-ins are not missed.

## Capabilities

1.  **Account Management**: CRUD operations for game accounts (add, remove, update details).
2.  **Daily Routine**: Reset tasks daily, track completion status.
3.  **Check-in Tracking**: Monitor and remind about daily check-ins/gifts.

## Usage

When the user asks to "check my accounts" or "finish daily tasks", this skill is activated.

## Structure

-   `src/`: Source code for the webapp management interface.
-   `data/`: (Conceptual) LocalStorage data structure.

## Context
The application uses React + Vite. Data is persisted in LocalStorage.
