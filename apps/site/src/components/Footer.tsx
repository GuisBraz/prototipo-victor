import { brand, navLinks } from "../config/brand";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer on-dark">
      <div className="wrap">
        <div className="site-footer__grid">
          <div>
            <h2>{brand.name}</h2>
            <p>{brand.description}</p>
          </div>
          <nav aria-label="Rodapé">
            <h2>Navegação</h2>
            <ul>{navLinks.map((l) => (<li key={l.href}><a href={l.href}>{l.label}</a></li>))}</ul>
          </nav>
        </div>
        <div className="site-footer__legal">
          <span>© {year} {brand.name}. Site de apresentação do produto, em desenvolvimento.</span>
        </div>
      </div>
    </footer>
  );
}
