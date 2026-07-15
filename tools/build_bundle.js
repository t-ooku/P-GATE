'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = require(path.join(root, 'package.json')).version.replace(/\.0$/, '');
const order = [
  'Utility.gs',
  'Config.gs',
  'Logger.gs',
  'DriveService.gs',
  'ImportLog.gs',
  'ZipEngine.gs',
  'ImportEngine.gs',
  'MappingEngine.gs',
  'NormalizeEngine.gs',
  'ValidationEngine.gs',
  'HashEngine.gs',
  'DatabaseEngine.gs',
  'OpportunityEngine.gs',
  'MeasurementEngine.gs',
  'MarketplaceMeasurementEngine.gs',
  'ContractPolicyEngine.gs',
  'BenchmarkEngine.gs',
  'MarketplaceEngine.gs',
  'MultilingualSeoEngine.gs',
  'ProductIdentifierEngine.gs',
  'KnowledgeEngine.gs',
  'LineIntegration.gs',
  'PreflightEngine.gs',
  'Main.gs'
];

const output = order
  .map((file) => fs.readFileSync(path.join(root, 'gas', file), 'utf8').trimEnd())
  .join('\n\n') + '\n';

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', `Project_GATE_Complete_v${version}.gs`), output, 'utf8');
fs.writeFileSync(path.join(root, 'dist', 'Project_GATE_Complete.gs'), output, 'utf8');
