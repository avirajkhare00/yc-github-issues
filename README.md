# YC GitHub Good First Issues

A Next.js 16 application that fetches "good first issues" from YC-backed open source projects listed in the `repos.txt` file. This project helps developers find beginner-friendly issues to contribute to.

## Features

- Fetches good first issues from GitHub repositories
- Falls back to active issues if no good first issues are found
- Responsive UI with issue cards showing relevant information
- Dark mode support

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### GitHub API Token (Recommended)

To avoid GitHub API rate limits (60 requests/hour without authentication), it's recommended to use a GitHub token:

1. Create a GitHub personal access token at [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Copy the `.env.local.example` file to `.env.local`:

```bash
cp .env.local.example .env.local
```

3. Add your GitHub token to the `.env.local` file:

```
GITHUB_TOKEN=your_github_token_here
```

With authentication, you'll have 5,000 requests/hour instead of 60.

### Adding Repositories

Edit the `repos.txt` file to add or remove GitHub repository URLs. Each URL should be on a new line.

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
