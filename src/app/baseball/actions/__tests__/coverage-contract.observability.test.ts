import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { FEATURE_REGISTRY } from '@/lib/admin/feature-registry';

const BASEBALL_APP_ROOT = path.join(process.cwd(), 'src/app/baseball');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

function hasUseServerDirective(source: string): boolean {
  return /^\s*['"]use server['"]/m.test(source);
}

function isExported(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
}

function isDefaultExport(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Default);
}

function wrappedActionNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          ts.isCallExpression(declaration.initializer)
        ) {
          const callee = declaration.initializer.expression.getText(sourceFile);
          if (callee === 'withBaseballAction' || callee === 'withAdminObserved') {
            names.add(declaration.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return names;
}

function optionString(sourceFile: ts.SourceFile, objectLiteral: ts.ObjectLiteralExpression, name: string): string | null {
  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      property.name.getText(sourceFile).replaceAll('"', '').replaceAll("'", '') === name &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      return property.initializer.text;
    }
  }
  return null;
}

describe('Baseball server-action observability coverage', () => {
  it('wraps direct server-action exports with Helm Bridge error tracking', () => {
    const gaps: string[] = [];

    for (const file of walk(BASEBALL_APP_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!hasUseServerDirective(source)) continue;
      if (/[\\/]page\.tsx$|[\\/]layout\.tsx$/.test(file)) continue;

      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const wrappedNames = wrappedActionNames(sourceFile);

      function visit(node: ts.Node): void {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name &&
          isExported(node) &&
          !isDefaultExport(node)
        ) {
          const body = node.body?.getText(sourceFile) ?? '';
          const delegatesToWrapped = [...wrappedNames].some((name) =>
            new RegExp(`\\b${name}\\s*\\(`).test(body),
          );
          const wrapsInline = /\bwith(BaseballAction|AdminObserved)\s*\(/.test(body);
          const logsInline = /\blogServerException\s*\(/.test(body);

          if (!delegatesToWrapped && !wrapsInline && !logsInline) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            gaps.push(`${path.relative(process.cwd(), file)}:${line} ${node.name.text}`);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(gaps).toEqual([]);
  });

  it('registers every emitted Baseball feature key in Helm Bridge', () => {
    const registryKeys = new Set<string>(FEATURE_REGISTRY.map((feature) => feature.key));
    const missing: string[] = [];

    for (const file of walk(BASEBALL_APP_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!hasUseServerDirective(source)) continue;

      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      function visit(node: ts.Node): void {
        const opts = ts.isCallExpression(node) ? node.arguments[1] : undefined;
        if (
          ts.isCallExpression(node) &&
          (node.expression.getText(sourceFile) === 'withBaseballAction' ||
            node.expression.getText(sourceFile) === 'withAdminObserved') &&
          opts &&
          ts.isObjectLiteralExpression(opts)
        ) {
          const feature =
            optionString(sourceFile, opts, 'feature') ??
            optionString(sourceFile, opts, 'featureArea')?.replaceAll('-', '_');
          if (feature && !registryKeys.has(feature)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            missing.push(`${path.relative(process.cwd(), file)}:${line} ${feature}`);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(missing).toEqual([]);
  });
});
