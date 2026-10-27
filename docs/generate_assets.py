"""Compatibility entry point: prepare the real planetary maps.

The former synthetic sphere/crack generator was retired. It must not overwrite
the licensed astronomical derivatives. See planet-credits.txt and prepare_planets.py.
"""
from prepare_planets import main

if __name__ == '__main__':
    main()
