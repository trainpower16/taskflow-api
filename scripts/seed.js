'use strict';

/**
 * Seeds a demo administrator, project and tasks. Used to give the deployed
 * environments some data to look at during the demonstration.
 */

const database = require('../src/config/database');
const authService = require('../src/services/authService');
const projectService = require('../src/services/projectService');
const taskService = require('../src/services/taskService');

async function seed() {
  database.connect();

  const email = process.env.SEED_EMAIL || 'admin@taskflow.local';
  const password = process.env.SEED_PASSWORD || 'admin-password-123';

  const admin = await authService
    .register({ email, name: 'Demo Admin', password, role: 'admin' })
    .catch(() => null);

  if (!admin) {
    console.log(`Seed skipped: ${email} already exists`);
    database.close();
    return;
  }

  const project = projectService.create(admin, {
    name: 'Website Redesign',
    description: 'Demo project seeded for the pipeline demonstration',
  });

  const tasks = [
    { title: 'Draft the wireframes', status: 'done', priority: 'high' },
    { title: 'Build the component library', status: 'in_progress', priority: 'high' },
    { title: 'Write the integration tests', status: 'todo', priority: 'medium' },
    { title: 'Prepare the launch checklist', status: 'todo', priority: 'low' },
  ];
  for (const task of tasks) {
    taskService.create(admin, project.id, task);
  }

  console.log(`Seeded ${tasks.length} tasks in project "${project.name}" for ${email}`);
  database.close();
}

seed().catch((err) => {
  console.error(`Seed failed: ${err.message}`);
  process.exit(1);
});
