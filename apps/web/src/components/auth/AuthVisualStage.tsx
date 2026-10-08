type AuthVisualStageProps = {
  isEs: boolean;
};

/** Zona promocional: logo, tipografía mockup, pedestal, mascota, PC, teléfono y props. */
export function AuthVisualStage({ isEs }: AuthVisualStageProps) {
  return (
    <aside className="lb-auth-hero" aria-label="LiveBoom">
      <div className="lb-auth-hero__copy">
        <img
          src="/assets/auth/logo-liveboom.png"
          alt="LiveBoom"
          className="lb-auth-hero__logo"
          width={983}
          height={631}
          decoding="async"
        />
        <p className="lb-auth-hero__tag">
          <span>Vive</span>
          <em className="lb-auth-hero__tag-sep lb-auth-hero__tag-sep--pink" aria-hidden>
            •
          </em>
          <span>Crea</span>
          <em className="lb-auth-hero__tag-sep lb-auth-hero__tag-sep--cyan" aria-hidden>
            •
          </em>
          <span>Conecta</span>
        </p>
        <h2 className="lb-auth-hero__headline">
          {isEs ? (
            <>
              <span className="lb-auth-hero__line lb-auth-hero__line--white">Explora</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--white">lo que</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--pink">más te</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--cyan">
                gusta
                <i className="lb-auth-hero__brush" aria-hidden="true" />
              </span>
            </>
          ) : (
            <>
              <span className="lb-auth-hero__line lb-auth-hero__line--white">Explore</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--white">what you</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--pink">love</span>
              <span className="lb-auth-hero__line lb-auth-hero__line--cyan">
                most
                <i className="lb-auth-hero__brush" aria-hidden="true" />
              </span>
            </>
          )}
        </h2>
      </div>

      <div className="lb-auth-stage" aria-hidden="true">
        <span className="lb-auth-stage__floor-glow" />
        <img
          src="/assets/auth/stage-liveboom.png"
          alt=""
          className="lb-auth-stage__pedestal"
          width={1006}
          height={343}
          decoding="async"
        />
        <img
          src="/assets/auth/mascot-bomb.png"
          alt=""
          className="lb-auth-stage__mascot"
          width={776}
          height={790}
          decoding="async"
        />
        <span className="lb-auth-stage__pc-glow" />
        <div className="lb-auth-pc-fan">
          <img
            src="/assets/auth/pc-liveboom.png"
            alt=""
            className="lb-auth-stage__pc"
            width={777}
            height={797}
            decoding="async"
          />
          <img
            src="/assets/auth/pc-card-messages.jpg"
            alt=""
            className="lb-auth-pc-fan__card lb-auth-pc-fan__card--1"
            width={480}
            height={640}
            decoding="async"
          />
          <img
            src="/assets/auth/pc-card-clips.jpg"
            alt=""
            className="lb-auth-pc-fan__card lb-auth-pc-fan__card--2"
            width={480}
            height={640}
            decoding="async"
          />
          <img
            src="/assets/auth/pc-card-friends.jpg"
            alt=""
            className="lb-auth-pc-fan__card lb-auth-pc-fan__card--3"
            width={480}
            height={640}
            decoding="async"
          />
        </div>
        <span className="lb-auth-stage__phone-glow" />
        <img
          src="/assets/auth/phone-liveboom.png"
          alt=""
          className="lb-auth-stage__phone"
          width={500}
          height={960}
          decoding="async"
        />
        <img
          src="/assets/auth/gift-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--gift"
          width={665}
          height={731}
          decoding="async"
        />
        <img
          src="/assets/auth/coin-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--coin-a"
          width={706}
          height={712}
          decoding="async"
        />
        <img
          src="/assets/auth/coin-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--coin-b"
          width={706}
          height={712}
          decoding="async"
        />
        <img
          src="/assets/auth/heart-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--heart-a"
          width={890}
          height={690}
          decoding="async"
        />
        <img
          src="/assets/auth/heart-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--heart-b"
          width={890}
          height={690}
          decoding="async"
        />
        <img
          src="/assets/auth/star-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--star-a"
          width={695}
          height={638}
          decoding="async"
        />
        <img
          src="/assets/auth/star-liveboom.png"
          alt=""
          className="lb-auth-prop lb-auth-prop--star-b"
          width={695}
          height={638}
          decoding="async"
        />
      </div>
    </aside>
  );
}
