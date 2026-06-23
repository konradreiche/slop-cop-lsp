import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node'

import { TextDocument } from 'vscode-languageserver-textdocument'

import { runClientDetectors } from '../src/detectors/index'
import { RULES_BY_ID } from '../src/rules'
import type { Violation } from '../src/types'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
    serverInfo: {
      name: 'slop-cop',
      version: '0.1.0',
    },
  }
})

documents.onDidChangeContent(change => {
  validateDocument(change.document)
})

documents.onDidClose(event => {
  connection.sendDiagnostics({
    uri: event.document.uri,
    diagnostics: [],
  })
})

function validateDocument(document: TextDocument): void {
  const text = document.getText()

  let violations: Violation[]

  try {
    violations = runClientDetectors(text)
  } catch (error) {
    connection.console.error(
      `slop-cop detector error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    )
    return
  }

  connection.sendDiagnostics({
    uri: document.uri,
    version: document.version,
    diagnostics: violations.map(v => violationToDiagnostic(document, v)),
  })
}

function violationToDiagnostic(
  document: TextDocument,
  v: Violation,
): Diagnostic {
  const rule = RULES_BY_ID[v.ruleId]

  return {
    range: {
      start: document.positionAt(v.startIndex),
      end: document.positionAt(v.endIndex),
    },
    severity: DiagnosticSeverity.Information,
    code: v.ruleId,
    source: 'slop-cop',
    message: rule ? `[${rule.name}] ${rule.tip}` : v.ruleId,
  }
}

documents.listen(connection)
connection.listen()
