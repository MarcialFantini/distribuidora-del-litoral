import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

/* Loaded on demand after first paint, so GSAP never sits on the critical path. */
gsap.registerPlugin(MotionPathPlugin, Flip);

export { gsap, Flip, MotionPathPlugin };
