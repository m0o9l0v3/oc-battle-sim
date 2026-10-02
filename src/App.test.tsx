import { renderToString } from 'react-dom/server'
import { expect, it } from 'vitest'
import App from './App'

it('renders the title', () => {
  expect(renderToString(<App />)).toContain('OC Battle Sim')
})
