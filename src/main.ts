import './style.css';
import { mount } from './app';

const el = document.getElementById('app');
if (el) void mount(el);
