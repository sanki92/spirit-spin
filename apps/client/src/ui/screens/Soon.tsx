import { useNav } from '../../state/nav'
import { Img, Screen, Slash, TopBar } from '../kit'

export function ComingSoon({ title, icon, text }: { title: string; icon: string; text: string }) {
  const nav = useNav()
  return (
    <Screen className="soon">
      <TopBar title={title} />
      <section className="soon-card">
        <Img id={icon} className="soon-icon" />
        <span className="soon-tag">Coming soon</span>
        <h2>{title} is on its way</h2>
        <p>{text}</p>
        <Slash onClick={() => nav.back()}>Back</Slash>
      </section>
    </Screen>
  )
}
