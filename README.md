# Panacea Web — Booking and Customer Support

**University course project · Faculty of Information Systems · University of Economics and Law (UEL), Vietnam National University Ho Chi Minh City**

Panacea is a team-built web platform for discovering treatment rooms, making bookings, and accessing customer support. This repository is a lightweight portfolio selection from the broader project, with a standalone homepage adaptation and an original source-code example. It does not contain the full team repository.

[View portfolio homepage](https://gonovn.me/panacea-web-portfolio/) · [Visit the original project homepage](https://www.panaceabooking.io.vn/)

## My involvement

I contributed to parts of the booking and customer-support flows, including booking history, application data and chatbot-related features. The original project was developed collaboratively. Git history records contributions by `gonostudy305` to the booking-history component and to the chat quick-reply engine; the selected code below should be understood in that team context rather than as proof of sole authorship.

## What is in this repository

| Item | What it demonstrates | Scope |
| --- | --- | --- |
| `index.html`, `assets/homepage-hero.css` | Homepage presentation and search controls | Standalone adaptation of the original Angular homepage template and selected CSS. Data and controls are illustrative; they do not search or book. |
| `assets/BACKGROUND-poster.webp`, `assets/SUBLOGO.webp` | Original homepage poster and logo | The poster replaces the original video to keep this portfolio light. |
| `src/quickReplyEngine.js` | Context-aware suggestions for the Pana customer-support chatbot | Selected original JavaScript module from the team project's chat gateway; one hostname reference in a comment was generalized. No API, credentials or customer records are included. |
| `test/quickReplyEngine.test.js` | Executable behavioral checks | New, standalone tests for the selected module, written for this portfolio; they are not the original project test suite. |

## Engineering example: controlled quick replies

The selected module ranks approved suggestion candidates based on page context and booking intent. It limits output, removes duplicates, maintains a legacy text projection, and suppresses automated suggestions during a human handoff. Tests check route classification, booking suggestions and handoff behavior using synthetic inputs.

Run the tests with Node.js 20 or newer:

```bash
node --test test/quickReplyEngine.test.js
```

No package installation is needed. Open `index.html` directly in a browser to inspect the static homepage. The search controls are intentionally illustrative; they do not call an API or create bookings.

## Original project and limitations

The team project included an Angular client, Node.js/Express APIs, MongoDB and a chat gateway. This portfolio does not recreate the full application, publish original Git history, or demonstrate production deployment. The original homepage contains additional functionality and a video; the portfolio uses its lightweight poster instead. Project assets and code are presented as selected work from a collaborative course project.
