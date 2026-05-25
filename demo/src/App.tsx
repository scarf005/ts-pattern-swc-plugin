import { match, P } from 'ts-pattern'
import './App.css'

type Invoice =
  | { status: 'paid'; total: number }
  | { status: 'open'; total: number }
  | { status: 'void' }

const invoices: Invoice[] = [
  { status: 'paid', total: 128 },
  { status: 'open', total: 42 },
  { status: 'void' },
]

const labelFor = (invoice: Invoice) =>
  match(invoice)
    .with({ status: 'paid', total: P.number }, ({ total }) => `Paid $${total}`)
    .with({ status: 'open', total: P.number }, ({ total }) => `Open $${total}`)
    .with({ status: 'void' }, () => 'Void')
    .exhaustive()

function App() {
  return (
    <main>
      <h1>ts-pattern SWC plugin demo</h1>
      <ul>
        {invoices.map((invoice, index) => (
          <li key={index}>{labelFor(invoice)}</li>
        ))}
      </ul>
    </main>
  )
}

export default App
