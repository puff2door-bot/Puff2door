import React from "react";

const AnimatedLogo = ({ testId, className = "h-10 w-10", imageClassName = "" }) => (
  <span className={`p2d-logo ${className}`} aria-hidden="true">
    <span className="p2d-logo__halo" />
    <img
      src="/img/logo.png"
      alt=""
      data-testid={testId}
      className={`p2d-logo__image rounded-full object-contain ${imageClassName}`}
    />
    <span className="p2d-logo__puff p2d-logo__puff--one" />
    <span className="p2d-logo__puff p2d-logo__puff--two" />
    <span className="p2d-logo__puff p2d-logo__puff--three" />
  </span>
);

export default AnimatedLogo;
