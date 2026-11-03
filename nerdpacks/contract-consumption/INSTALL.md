# Contract Consumption: install guide

A step-by-step guide to getting the **Contract Consumption** app running in your own New Relic account, starting from a machine with nothing installed. Follow the steps in order and do the **Check** after each one before moving on.

**What you will end up with:** an app called *Contract Consumption* in your New Relic **Apps** menu that compares your real usage (users, data, Core CCU, aCCU) against a Volume, Savings or Advantage contract.

**Time:** about 30 minutes the first time.

**What the app does and does not do:** it reads usage that New Relic already records and compares it with the contract you type in. It is an analyser, not a simulator, and its figures are estimates, not invoices.

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Get access to the code on GitHub](#2-get-access-to-the-code-on-github)
3. [Install the tools](#3-install-the-tools)
4. [Let Git talk to the private repo](#4-let-git-talk-to-the-private-repo)
5. [Download (clone) the code](#5-download-clone-the-code)
6. [Tell the app which accounts to use](#6-tell-the-app-which-accounts-to-use)
7. [Connect the New Relic CLI to your account](#7-connect-the-new-relic-cli-to-your-account)
8. [Install dependencies](#8-install-dependencies)
9. [Give the app your own ID (do not skip)](#9-give-the-app-your-own-id-do-not-skip)
10. [Try it locally (optional)](#10-try-it-locally-optional)
11. [Publish and subscribe](#11-publish-and-subscribe)
12. [Open the app and enter your contract](#12-open-the-app-and-enter-your-contract)
13. [Updating later](#13-updating-later)
14. [Removing the app](#14-removing-the-app)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Before you start

You need all of these. If you are missing one, sort it out first.

| You need | Why | How to check |
|---|---|---|
| A **GitHub account** that has been invited to `ol1000/nr-apps` | The code is in a **private** repository | Step 2 |
| A **New Relic account** where you can publish apps | The app is published into it | You can sign in at one.newrelic.com (US) or one.eu.newrelic.com (EU) |
| A New Relic **user** with permission to manage Nerdpacks | Publishing and subscribing needs it | Usually an admin, or a role with *Nerdpack Manager* |
| An account that records **usage events** (`NrConsumption`, `NrMTDConsumption`) | This is where the usage comes from. It is normally your organisation's **main (parent) account** | Step 6 |
| A computer with **permission to install software** | Git, Node.js and the CLI | |

Write down your **region**. It matters later:

- **US**: you sign in at `one.newrelic.com`
- **EU**: you sign in at `one.eu.newrelic.com`

> **Terminal.** Several steps use a terminal (a window where you type commands).
> macOS: open **Terminal** (Cmd+Space, type *Terminal*). Windows: open **PowerShell**. Linux: open your terminal app.
> Type each command exactly as shown and press Enter. Lines starting with `#` are comments, not commands.

---

## 2. Get access to the code on GitHub

The repository is private, so GitHub shows a **404 "Page not found"** to anyone who has not been given access. That 404 does not mean the link is wrong.

1. Make sure you have a GitHub account (free): https://github.com/signup
2. Ask the repository owner (**ol1000**) to invite your GitHub **username**: *Settings → Collaborators → Add people*.
3. Accept the invitation. Either click the link in the invitation email, or go to https://github.com/ol1000/nr-apps/invitations while signed in.
4. **Check:** open https://github.com/ol1000/nr-apps while signed in. You should see the file list, not a 404.

If you still get a 404:

- You are signed in to a different GitHub account than the one that was invited. Check the username in the top-right menu.
- The invitation went to a different email address. Ask the owner to re-invite your exact username.
- The invitation has expired (they last about 7 days). Ask for a new one.

---

## 3. Install the tools

You need three things: **Git**, **Node.js** (which includes **npm**) and the **New Relic One CLI** (`nr1`).

### 3a. Git

| System | Install |
|---|---|
| macOS | In Terminal run `xcode-select --install` and click *Install*. (Or, if you use Homebrew: `brew install git`.) |
| Windows | Download and run the installer from https://git-scm.com/download/win and accept the defaults. Then open a **new** PowerShell window. |
| Linux (Debian/Ubuntu) | `sudo apt update && sudo apt install -y git` |

**Check:**

```
git --version
```

You should see something like `git version 2.39.0`. Any recent version is fine.

### 3b. Node.js and npm

Install the current **LTS** version from https://nodejs.org (download the installer, accept the defaults). Then open a **new** terminal window so it is picked up.

**Check:**

```
node --version
npm --version
```

You should see version numbers (for example `v20.x.x` and `10.x.x`). If you see "command not found", close and reopen the terminal, or reinstall.

### 3c. The New Relic One CLI (`nr1`)

`nr1` is New Relic's own tool for building and publishing apps. It is **not** installed with `npm install`. New Relic keeps the current install instructions on this page, so use it instead of copying a command from anywhere else:

**https://developer.newrelic.com/build-apps/set-up-dev-env/**

Follow its **"download the New Relic CLI"** steps for your system. Then open a **new** terminal.

**Check:**

```
nr1 --version
```

You should see a line such as `@datanerd/nr1/3.0.3 darwin-x64 node-v16.11.1`. The exact numbers do not matter. If you see "command not found", the CLI is not on your PATH: close and reopen the terminal, or repeat the install.

> `nr1` carries its own copy of Node for its own use. That is why `nr1 --version` may show a different Node version from `node --version`. This is normal.

---

## 4. Let Git talk to the private repo

Because the repo is private, Git must prove who you are. Pick **one** option.

### Option A: Personal access token over HTTPS (simplest)

1. On GitHub: your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it `nr-apps`, set an expiry, and under **Repository access** choose **Only select repositories → ol1000/nr-apps**.
3. Under **Permissions → Repository permissions**, set **Contents** to **Read and write** (use **Read-only** if you will only download, never push).
4. Click **Generate token** and **copy it now**. GitHub only shows it once.
5. When Git asks for a password in step 5, paste the token. Your *username* is your GitHub username.

To stop Git asking every time:

```
git config --global credential.helper store      # Linux
git config --global credential.helper osxkeychain  # macOS
git config --global credential.helper manager      # Windows
```

> Treat the token like a password. Never paste it into a file in the repo or share it.

### Option B: SSH key

Follow GitHub's guide: https://docs.github.com/en/authentication/connecting-to-github-with-ssh . Then use the SSH address `git@github.com:ol1000/nr-apps.git` in step 5.

### Tell Git your name (once per computer)

```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## 5. Download (clone) the code

Choose a folder to keep it in, then clone. This example uses a `projects` folder in your home directory:

```
cd ~
mkdir -p projects
cd projects
git clone https://github.com/ol1000/nr-apps.git
```

(Windows PowerShell: use `mkdir projects` and `cd projects`; skip `-p`.)

When asked for a username and password, give your **GitHub username** and the **token** from step 4.

Then go into the app's folder. **Every command from here on is run in this folder:**

```
cd nr-apps/nerdpacks/contract-consumption
```

**Check:**

```
ls
```

(Windows: `dir`.) You should see `INSTALL.md`, `launchers`, `nerdlets`, `nr1.json`, `package.json` and `package-lock.json`.

Common failures:

- `remote: Repository not found` or `403`: your GitHub account is not invited yet (step 2), or the token cannot see this repository (step 4).
- `Authentication failed`: the token is wrong or expired. Generate a new one.

---

## 6. Tell the app which accounts to use

The app needs two account IDs. The repository ships with placeholders (`0`) because account IDs are specific to each organisation.

### Find your account IDs

- In New Relic, open the account picker (top of the page). The number next to an account name is its **account ID**.
- The **usage account** must be the one that holds your organisation's usage events. This is usually the **main / parent** account. To confirm, open **Query your data** in that account and run:

  ```
  FROM NrConsumption SELECT count(*) SINCE 1 month ago
  ```

  A number above zero means this is the right account. A zero (or an error) means try the main account of your organisation.
- The **storage account** is the account the app will be subscribed to in step 11. It is where your saved contract is kept. Use the account that owns the API key you create in step 7.

They can be the same account.

### Edit the settings file

Open this file in any text editor:

```
nerdlets/contract-consumption-nerdlet/lib/config.js
```

Replace the two `0` values:

```js
// The organisation's MAIN account: usage events (NrConsumption, NrMTDConsumption) hold every account only there.
export const USAGE_ACCOUNT_ID = 1234567; // <- your usage account ID

// Account whose NerdStorage keeps the contract inputs (the account this app is subscribed to).
export const STORAGE_ACCOUNT_ID = 7654321; // <- your storage account ID
```

Leave `STORAGE_COLLECTION` and `STORAGE_DOCUMENT` as they are.

> **Do not commit your real account IDs.** The repository copy of `config.js` deliberately has placeholders. To make Git ignore your local edit:
>
> ```
> git update-index --skip-worktree nerdlets/contract-consumption-nerdlet/lib/config.js
> ```

---

## 7. Connect the New Relic CLI to your account

### Create a user API key

1. In New Relic, click your name (bottom left) → **API keys**.
2. Click **Create a key**. Choose the account, set **Key type** to **User**, give it a name such as `nr1-cli`, and create it.
3. Copy the key. It starts with `NRAK-`.

### Add it to `nr1` as a profile

Replace the name, the key and the region (`us` or `eu`, from step 1):

```
nr1 profiles:add --name myprofile --api-key NRAK-XXXXXXXXXXXXXXXXXXXXXXXX --region us
nr1 profiles:default --name myprofile
```

**Check:**

```
nr1 profiles:list
```

You should see your profile, with `(default)` next to it and the right region.

> Never put the API key in a file inside this folder or in Git. `nr1` stores it for you.
>
> If you have several profiles, add `--profile=myprofile` to every `nr1` command below.

---

## 8. Install dependencies

Still in the `contract-consumption` folder:

```
npm install
```

This downloads the React libraries into a `node_modules` folder (a minute or two).

**Check:** the command ends without the word `ERR!`. Warnings (`npm WARN` / `deprecated`) are normal and can be ignored.

If it fails: make sure you are in the right folder (`ls` should show `package.json`), then try `rm -rf node_modules && npm install` (Windows: delete the `node_modules` folder, then run `npm install`).

---

## 9. Give the app your own ID (do not skip)

Every Nerdpack has a unique ID in `nr1.json`. The ID that comes with the repository **belongs to someone else's account**. If you publish with it you get a **403 / "not authorized"** error. Generate your own:

```
nr1 nerdpack:uuid -gf
```

(Add `--profile=myprofile` if your profile is not the default.)

**Check:** it prints `The new generated UUID is ...` and the `id` line in `nr1.json` has changed.

Important:

- **Run this with the same profile you publish with** (step 11). An ID generated under a different profile or region will not publish.
- `nr1.json` now differs from the repository. **Do not commit this change.** To keep Git quiet:

  ```
  git update-index --skip-worktree nr1.json
  ```

---

## 10. Try it locally (optional)

This runs the app from your computer inside New Relic, without publishing:

```
nr1 nerdpack:serve
```

It prints a link labelled **Local development** (for example `https://one.newrelic.com/?nerdpacks=local`; EU accounts get the `one.eu.newrelic.com` equivalent). Open it, then open **Apps → Contract Consumption** (it appears under a "Local" section). Stop it any time with **Ctrl+C**.

---

## 11. Publish and subscribe

Publishing uploads the app to New Relic. Subscribing makes it appear in an account's **Apps** menu.

```
nr1 nerdpack:publish
nr1 subscription:set -c STABLE
```

**Check:** the first command ends with `Nerdpack published successfully!` and `Tagged ... as STABLE`. The second ends with `Subscribed account ... to the nerdpack ...`.

Notes:

- `subscription:set` subscribes the account that owns your API key. To make the app visible in **other** accounts, an admin of each account can use **Apps → Contract Consumption → Manage access** in the New Relic UI.
- If subscribing another account fails with **`TNC_NOT_ACCEPTED`**, that account has not accepted the Nerdpack terms of service yet. An admin of that account must accept them in the UI first.
- You can list your subscriptions with `nr1 subscription:list`.

---

## 12. Open the app and enter your contract

1. In New Relic, open **Apps** (left menu, you may need *All capabilities* first) and click **Contract Consumption**. If it is missing, hard-refresh the page (Cmd+Shift+R or Ctrl+Shift+R).
2. The first time, the **Edit contract** panel opens by itself. Choose your plan:

   | Plan | You enter | The app shows |
   |---|---|---|
   | **Volume** | A **monthly minimum** per metric for each contract year, plan rates, an optional overage rate and an optional prepaid top-up | Deal value, overage bills month by month, what was invoiced |
   | **Savings** | The same minimums and rates, plus an optional prepaid top-up and a pay-as-you-go rate | Deal value drawn down by the minimums, top-up used and left, pay-as-you-go beyond it |
   | **Advantage** | A **budget per contract year**, plan rates, an optional pay-as-you-go rate, and whether unspent budget rolls over | One shared budget drawn down by all usage, the date it runs out, usage billed beyond it |

3. Set the **term start and end** dates and the currency label.
4. Fill in the minimums (Volume/Savings) or yearly budgets (Advantage) and the **rate card**. Metrics with no plan rate are shown in units only, not money.
5. Click **Save contract**. The text next to the button says where it was saved:
   - *Saved to account storage*: shared with everyone who opens the app in that account.
   - *Saved in this browser only*: account storage was not available. Check `STORAGE_ACCOUNT_ID` (step 6) and that the app is subscribed to that account (step 11).
6. Close the panel. The cards, charts and table fill in from your real usage.

If you see **"Could not load usage data"**, see the troubleshooting table below.

---

## 13. Updating later

When a new version is released:

```
cd ~/projects/nr-apps
git pull
cd nerdpacks/contract-consumption
npm install
nr1 nerdpack:publish
```

Notes:

- If `git pull` complains about local changes to `config.js` or `nr1.json`, you did not run the `skip-worktree` commands in steps 6 and 9. Undo with `git update-index --no-skip-worktree <file>`, `git stash`, pull, then `git stash pop`, and check your account IDs and `id` are still yours.
- Every publish needs a **higher `version`** in `package.json` than the last one you published. Edit it (for example `0.2.0` to `0.2.1`) before `nr1 nerdpack:publish`. Subscribers pick up the new STABLE version automatically; a hard-refresh may be needed.

---

## 14. Removing the app

```
nr1 subscription:unset
```

This unsubscribes your account so the app disappears from **Apps**. Saved contract data stays in that account's NerdStorage. Delete the local copy by deleting the `nr-apps` folder.

---

## 15. Troubleshooting

| What you see | What it means and what to do |
|---|---|
| GitHub shows **404** for the repository | Invitation not accepted, or wrong GitHub account. See step 2. |
| `git clone`: **Repository not found** / **403** | No access to the private repo, or the token cannot see it. See steps 2 and 4. |
| `git clone`: **Authentication failed** | Wrong or expired token. Generate a new one (step 4). |
| `git: command not found` | Git is not installed or the terminal was not reopened. Step 3a. |
| `node` / `npm: command not found` | Node.js is not installed or the terminal was not reopened. Step 3b. |
| `nr1: command not found` | CLI not installed or not on your PATH. Step 3c, then open a new terminal. |
| `npm install` fails | Wrong folder (you need `package.json` in the current folder), or a broken download: delete `node_modules` and retry. Make sure Node is a current LTS version. |
| `nr1 nerdpack:publish` returns **403** or "not authorized" | The `id` in `nr1.json` is not yours or was made under a different profile. Re-run `nr1 nerdpack:uuid -gf` with the profile you publish with (step 9). |
| `publish` or `uuid` says the profile or key is invalid | Re-run `nr1 profiles:add` (step 7). Check the region matches where you sign in. |
| `publish` complains the version already exists | Raise `version` in `package.json`, then publish again. |
| `subscription:set` fails with **`TNC_NOT_ACCEPTED`** | The account has not accepted the Nerdpack terms. An admin must accept them in the UI. |
| App is not in the **Apps** menu | Not subscribed (step 11), wrong region, or a stale page. Hard-refresh. |
| **"Could not load usage data"** | `USAGE_ACCOUNT_ID` is wrong, your user cannot query that account, or the account has no `NrConsumption` data. Re-run the NRQL test in step 6. |
| Charts and cards show **n/a** or empty | No usage events for those months in the usage account. Months older than the usage history can be filled in by hand under *Edit contract → Earlier months with no usage history*. |
| Numbers show but **no money** | Metrics have no **plan rate**. Add rates under *Edit contract → Rate card*. |
| Contract does **not save** or says *browser only* | `STORAGE_ACCOUNT_ID` is not an account the app is subscribed to, or your user lacks NerdStorage access. |
| Everything looks dark or colours look inverted | New Relic adjusts app colours to its dark theme. The app uses a light design that follows the theme. If something is unreadable, take a screenshot and report it. |

---

## Safety notes

- **Never** commit or share your API key (`NRAK-...`), your GitHub token, or real account IDs.
- Figures in the app are estimates built from New Relic usage events. They are not invoices, and credits, contract-specific allowances and rounding can differ.
- The app only **reads** usage and **writes** your saved contract to NerdStorage. It does not change anything else in your account.
