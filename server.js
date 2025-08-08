// src/server.js або index.js
import express from 'express';
import dotenv from 'dotenv';
import JiraClient from 'jira-client';
import Confluence from 'confluence-api';
import axios from 'axios';

// Load env vars
dotenv.config();

// Init Express
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 7000;

// Init Jira
const jira = new JiraClient({
  protocol: 'https',
  host: process.env.JIRA_URL.replace(/^https?:\/\//, ''),
  username: process.env.JIRA_EMAIL,
  password: process.env.JIRA_API_TOKEN,
  apiVersion: '2',
  strictSSL: true,
});

// Init Confluence
const confluence = new Confluence({
  username: process.env.CONFLUENCE_EMAIL,
  password: process.env.CONFLUENCE_API_TOKEN,
  baseUrl: process.env.CONFLUENCE_URL,
});

app.get('/', (req, res) => {
  res.send('✅ Atlassian GPT Proxy is running!');
});

app.get('/jira/search', async (req, res) => {
  const { jql, maxResults = 10, startAt = 0 } = req.query;

  if (!jql) {
    return res.status(400).json({ error: 'Missing required JQL query' });
  }

  try {
    const result = await jira.searchJira(jql, {
      fields: [
        'summary',
        'description',
        'assignee',
        'status',
        'customfield_10026',
        'customfield_10034',
      ],
      maxResults: Number(maxResults),
      startAt: Number(startAt),
    });
    res.json(result.issues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search Jira issues' });
  }
});

app.get('/jira/issue/:key', async (req, res) => {
  try {
    const issue = await jira.findIssue(req.params.key);
    res.json(issue);
  } catch (err) {
    console.error('Jira page error:', err);
    res.status(500).json({ error: err.toString() });
  }
});

app.get('/jira/board/:component/sprints', async (req, res) => {
  const { component } = req.params;

  try {
    const boards = await jira.getAllBoards(); // /rest/agile/1.0/board
    const board = boards.values.find((b) => b.name.toLowerCase().includes(component.toLowerCase()));

    if (!board) {
      return res.status(404).json({ error: `Board not found for component: ${component}` });
    }

    const sprints = await jira.getAllSprints(board.id); // /rest/agile/1.0/board/{id}/sprint
    res.json(sprints.values);
  } catch (err) {
    console.error('Board sprint fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
});

app.get('/confluence/search', async (req, res) => {
  const { cql, maxResults = 10, startAt = 0 } = req.query;

  if (!cql) {
    return res.status(400).json({ error: 'Missing required CQL query' });
  }

  try {
    const response = await axios.get(`${process.env.CONFLUENCE_URL}/rest/api/content/search`, {
      params: {
        cql,
        limit: maxResults,
        start: startAt,
      },
      auth: {
        username: process.env.CONFLUENCE_EMAIL,
        password: process.env.CONFLUENCE_API_TOKEN,
      },
      headers: { Accept: 'application/json' },
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search Confluence content' });
  }
});

app.get('/confluence/page/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await axios.get(
      `${process.env.CONFLUENCE_URL}/rest/api/content/${id}?expand=body.storage`,
      {
        auth: {
          username: process.env.CONFLUENCE_EMAIL,
          password: process.env.CONFLUENCE_API_TOKEN,
        },
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const html = response.data.body.storage.value;

    const plainText = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    res.json({ title: response.data.title, text: plainText });
  } catch (error) {
    console.error('Confluence page error:', error);
    res.status(500).json({ error: 'Failed to fetch or parse Confluence page' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
