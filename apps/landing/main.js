/* ===========================================================================
 * CALISCAN — el poco JavaScript que la landing necesita.
 *
 * Sin dependencias, sin build, sin módulos: un `<script>` normal al final del
 * body. Todo lo que hay aquí es prescindible salvo lo primero — si este archivo
 * no cargara, la página se leería entera igual; solo los botones se quedarían
 * sin destino, y por eso ese es el bloque que va primero y sin ninguna
 * condición alrededor.
 * ======================================================================== */

/**
 * A DÓNDE LLEVA CADA BOTÓN. Se declara UNA sola vez, aquí arriba, y de aquí
 * salen TODOS los enlaces del sitio (`data-enlace-app`): la cabecera, los dos
 * CTA del hero y del cierre, los tres botones de los planes y el pie. Un solo
 * destino, sin excepciones ni ramas: a la app.
 *
 * Desde el deploy de la card 3.5 (02/09/2026) apunta al dominio propio:
 * `app.caliscan.app` está verificado en Firebase Hosting sobre el site de la
 * PWA. Es el único sitio del repo donde la landing sabe la dirección de la
 * app: si la dirección cambia, se cambia esta constante y NADA MÁS.
 */
const APP_URL = "https://app.caliscan.app";

(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // 1. Los destinos. Lo único que no puede fallar.
  // -------------------------------------------------------------------------
  const enlaces = document.querySelectorAll("[data-enlace-app]");
  enlaces.forEach(function (enlace) {
    enlace.href = APP_URL;
    // Se abre en la misma pestaña: la landing no es un sitio donde el visitante
    // esté haciendo algo que quiera conservar. `rel` por higiene, no por
    // seguridad — el destino es nuestro.
    enlace.rel = "noopener";
  });

  // -------------------------------------------------------------------------
  // 2. La línea de la cabecera, cuando hay contenido pasando por debajo.
  // -------------------------------------------------------------------------
  const cabecera = document.querySelector(".cabecera");
  if (cabecera) {
    let pendiente = false;
    const marcar = function () {
      cabecera.dataset.desplazada = window.scrollY > 12 ? "si" : "no";
      pendiente = false;
    };
    marcar();
    window.addEventListener(
      "scroll",
      function () {
        // Se pinta como mucho una vez por cuadro: el `scroll` se dispara
        // decenas de veces por segundo y no hace falta atenderlas todas.
        if (!pendiente) {
          pendiente = true;
          window.requestAnimationFrame(marcar);
        }
      },
      { passive: true }
    );
  }

  // -------------------------------------------------------------------------
  // 3. La entrada de las secciones al hacer scroll.
  //
  // La clase `js` en <html> es la que activa el estado inicial oculto en el
  // CSS. Se pone AQUÍ, desde el propio script, para que sin JavaScript nada
  // quede escondido esperando un efecto que no va a llegar. Y si el visitante
  // pidió menos movimiento, ni se activa.
  //
  // POR QUÉ UNA COMPROBACIÓN EN EL SCROLL Y NO UN `IntersectionObserver`.
  // El observador es lo elegante, y aquí está mal: solo avisa cuando un
  // elemento CRUZA el umbral. Si el visitante llega con un ancla (#faq), pulsa
  // "Fin" o recarga a media página, las tarjetas que quedaron ARRIBA del
  // encuadre nunca cruzan nada — pasan de "no visible por debajo" a "no visible
  // por encima" sin un solo aviso, y se quedan invisibles PARA SIEMPRE. Se
  // reprodujo en el navegador antes de escribir esto.
  //
  // La comprobación de abajo no tiene ese agujero porque no pregunta "¿está
  // entrando?" sino "¿ya pasó esta línea?", y lo que quedó arriba también la
  // pasó. Cuesta un `getBoundingClientRect` por tarjeta pendiente, una vez por
  // cuadro y solo hasta que se revelan; cuando no queda ninguna, el listener se
  // quita solo.
  // -------------------------------------------------------------------------
  const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!menosMovimiento) {
    let pendientes = Array.prototype.slice.call(
      document.querySelectorAll(
        ".seccion__cabecera, .paso, .capacidad, .plan, .faq__item, .cierre__caja, .hero__figura"
      )
    );

    if (pendientes.length) {
      document.documentElement.classList.add("js");

      pendientes.forEach(function (elemento, indice) {
        elemento.classList.add("aparece");
        // Un escalón corto entre hermanos: lo justo para que una fila entre como
        // una fila y no como cuatro cosas a la vez. Se reinicia cada cinco para
        // que ninguna tarjeta se haga esperar más de un cuarto de segundo.
        elemento.style.transitionDelay = (indice % 5) * 60 + "ms";
      });

      let enCola = false;

      const revisar = function () {
        enCola = false;
        // La línea a partir de la cual una tarjeta se considera "ya vista": un
        // poco por encima del borde inferior, para que entre acompañando al
        // scroll y no justo al asomar.
        const linea = window.innerHeight * 0.92;

        pendientes = pendientes.filter(function (elemento) {
          if (elemento.getBoundingClientRect().top < linea) {
            elemento.classList.add("visible");
            return false;
          }
          return true;
        });

        if (!pendientes.length) {
          window.removeEventListener("scroll", encolar);
          window.removeEventListener("resize", encolar);
        }
      };

      const encolar = function () {
        if (enCola) return;
        enCola = true;
        window.requestAnimationFrame(revisar);
      };

      window.addEventListener("scroll", encolar, { passive: true });
      window.addEventListener("resize", encolar);
      // La primera pasada va en el siguiente cuadro, no ahora mismo: si se
      // marcara "visible" en el mismo cuadro en que se pone "aparece", el
      // navegador no vería nunca el estado inicial y no habría transición.
      window.requestAnimationFrame(revisar);
    }
  }
})();
