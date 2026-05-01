import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test } from "vitest"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"

interface RenderResult {
  container: HTMLDivElement
  root: Root
}

async function renderElement(element: React.ReactNode): Promise<RenderResult> {
  const container = document.createElement("div")
  document.body.appendChild(container)

  const root = createRoot(container)

  await act(async () => {
    root.render(element)
  })

  return { container, root }
}

let mounted: RenderResult[] = []

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  for (const rendered of mounted) {
    await act(async () => {
      rendered.root.unmount()
    })
    rendered.container.remove()
  }

  mounted = []
})

describe("base control sizing", () => {
  test("renders taller default input and button controls", async () => {
    const rendered = await renderElement(
      <>
        <Input />
        <Button>Guardar</Button>
      </>
    )
    mounted.push(rendered)

    const input = rendered.container.querySelector('[data-slot="input"]')
    const button = rendered.container.querySelector('[data-slot="button"]')

    expect(input?.className).toContain("h-10")
    expect(button?.className).toContain("h-10")
  })

  test("renders a taller default select trigger", async () => {
    const rendered = await renderElement(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona una opcion" />
        </SelectTrigger>
      </Select>
    )
    mounted.push(rendered)

    const trigger = rendered.container.querySelector('[data-slot="select-trigger"]')

    expect(trigger?.className).toContain("data-[size=default]:h-10")
  })

  test("renders dialog overlays with backdrop blur", async () => {
    const rendered = await renderElement(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialogo</DialogTitle>
          <DialogDescription>Descripcion del dialogo</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    mounted.push(rendered)

    const overlay = document.body.querySelector('[data-slot="dialog-overlay"]')

    expect(overlay?.className).toContain("backdrop-blur")
  })

  test("renders dialogs fullscreen on mobile and wider on desktop", async () => {
    const rendered = await renderElement(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialogo</DialogTitle>
          <DialogDescription>Descripcion del dialogo</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    mounted.push(rendered)

    const content = document.body.querySelector('[data-slot="dialog-content"]')

    expect(content?.className).toContain("max-md:h-dvh")
    expect(content?.className).toContain("max-md:max-w-none")
    expect(content?.className).toContain("max-md:rounded-none")
    expect(content?.className).toContain("md:max-w-2xl")
    expect(content?.className).toContain("md:rounded-xl")
  })
})
