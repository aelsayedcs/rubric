import { redirect } from 'next/navigation'

// Home → send everyone to the operational Results list.
export default function Home() {
  redirect('/results')
}
