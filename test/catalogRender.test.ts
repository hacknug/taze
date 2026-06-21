import type { Addon, CheckOptions, PackageMeta, ResolvedDepChange } from '../src/types'
import c from 'ansis'
import { describe, expect, it, vi } from 'vitest'
import { renderChanges } from '../src/commands/check/render'

function makePkg(name: string, resolved: ResolvedDepChange[] = []): PackageMeta {
  return {
    name,
    private: false,
    version: '1.0.0',
    type: 'package.json',
    relative: 'package.json',
    filepath: '/tmp/package.json',
    raw: {},
    deps: [],
    resolved,
  }
}

function makeChange(depName: string, source: string): ResolvedDepChange {
  return {
    name: depName,
    currentVersion: '^1.0.0',
    targetVersion: '^2.0.0',
    source: source as any,
    update: true,
    diff: 'major',
    pkgData: {} as any,
    resolveError: null,
    provenanceDowngraded: false,
  }
}

describe('catalog display name consistency', () => {
  const options: CheckOptions = { all: false }

  it('should style pnpm-catalog: with dim prefix and yellow name', async () => {
    const pkg = makePkg('pnpm-catalog:default', [makeChange('react', 'pnpm-workspace')])
    const { lines } = await renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name
    expect(headerLine).toContain(c.dim('pnpm-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('pnpm-catalog:default'))
  })

  it('should style bun-catalog: with dim prefix and yellow name', async () => {
    const pkg = makePkg('bun-catalog:default', [makeChange('react', 'bun-workspace')])
    const { lines } = await renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name (same treatment as pnpm)
    expect(headerLine).toContain(c.dim('bun-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('bun-catalog:default'))
  })

  it('should style yarn-catalog: with dim prefix and yellow name', async () => {
    const pkg = makePkg('yarn-catalog:default', [makeChange('react', 'yarn-workspace')])
    const { lines } = await renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name (same treatment as pnpm)
    expect(headerLine).toContain(c.dim('yarn-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('yarn-catalog:default'))
  })

  it('should style named catalogs correctly for all managers', async () => {
    for (const prefix of ['pnpm-catalog:', 'bun-catalog:', 'yarn-catalog:']) {
      const catalogName = 'react18'
      const source = prefix.replace('-catalog:', '-workspace')
      const pkg = makePkg(`${prefix}${catalogName}`, [makeChange('react', source)])
      const { lines } = await renderChanges(pkg, options)
      const headerLine = lines[0]

      expect(headerLine).toContain(c.dim(prefix))
      expect(headerLine).toContain(c.yellow(catalogName))
    }
  })

  it('should use cyan for regular package names', async () => {
    const pkg = makePkg('@my/package', [makeChange('react', 'dependencies')])
    const { lines } = await renderChanges(pkg, options)
    const headerLine = lines[0]

    expect(headerLine).toContain(c.cyan('@my/package'))
  })

  it('should use filepath fallback for unnamed packages', async () => {
    const pkg = makePkg('', [makeChange('react', 'dependencies')])
    pkg.name = undefined as any
    const { lines } = await renderChanges(pkg, options)
    const headerLine = lines[0]

    expect(headerLine).toContain(c.red('›'))
  })
})

describe('addon render hooks', () => {
  const baseOptions: CheckOptions = { all: false, addons: [] }

  it('beforeRenderChange is called with columns, change and context', async () => {
    const beforeRenderChange = vi.fn((columns: string[], _change: ResolvedDepChange, _ctx: any) => [...columns, 'extra-column'])
    const addon: Addon = { beforeRenderChange }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(beforeRenderChange).toHaveBeenCalledOnce()
    const [columns, change, context] = beforeRenderChange.mock.calls[0]
    expect(Array.isArray(columns)).toBe(true)
    expect(change.name).toBe('react')
    expect(context.grouped).toBe(true)
    expect(context.timediff).toBe(true)
    expect(context.nodecompat).toBe(true)
  })

  it('afterRenderChange is called with the columns produced after beforeRenderChange', async () => {
    const beforeRenderChange = vi.fn((columns: string[]) => [...columns, 'added-by-before'])
    const afterRenderChange = vi.fn((columns: string[]) => columns)
    const addon: Addon = { beforeRenderChange, afterRenderChange }

    const pkg = makePkg('@my/pkg', [makeChange('lodash', 'devDependencies')])
    await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    const [columnsAfter] = afterRenderChange.mock.calls[0]
    expect(columnsAfter).toContain('added-by-before')
  })

  it('beforeRenderChanges is called with empty lines before content is added', async () => {
    let lengthAtCallTime = -1
    const beforeRenderChanges = vi.fn((lines: string[]) => {
      lengthAtCallTime = lines.length
      return lines
    })
    const addon: Addon = { beforeRenderChanges }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(beforeRenderChanges).toHaveBeenCalledOnce()
    expect(lengthAtCallTime).toBe(0)
  })

  it('afterRenderChanges is called with all lines after content is added', async () => {
    const afterRenderChanges = vi.fn((lines: string[]) => lines)
    const addon: Addon = { afterRenderChanges }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    const { lines } = await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(afterRenderChanges).toHaveBeenCalledOnce()
    const [linesArg] = afterRenderChanges.mock.calls[0]
    expect(linesArg).toEqual(lines)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('beforeRenderChanges can prepend lines to the output', async () => {
    const addon: Addon = {
      beforeRenderChanges: (lines: string[]) => ['# custom header', ...lines],
    }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    const { lines } = await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(lines[0]).toBe('# custom header')
  })

  it('afterRenderChanges can append lines to the output', async () => {
    const addon: Addon = {
      afterRenderChanges: (lines: string[]) => [...lines, '# custom footer'],
    }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    const { lines } = await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(lines.at(-1)).toBe('# custom footer')
  })

  it('async hooks are awaited correctly', async () => {
    const addon: Addon = {
      beforeRenderChange: async (columns: string[]) => {
        await Promise.resolve()
        return [...columns, 'async-column']
      },
      afterRenderChanges: async (lines: string[]) => {
        await Promise.resolve()
        return [...lines, '# async footer']
      },
    }

    const pkg = makePkg('@my/pkg', [makeChange('react', 'dependencies')])
    const { lines } = await renderChanges(pkg, { ...baseOptions, addons: [addon] })

    expect(lines.at(-1)).toBe('# async footer')
  })
})
