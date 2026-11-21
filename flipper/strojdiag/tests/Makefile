# Testy platformove nezavisle logiky (bezi na PC, ne na Flipperu).
#   make -C flipper/strojdiag/tests
CC ?= cc
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -Wshadow -Wdouble-promotion -O1 -g -fsanitize=address,undefined

SRC = test_core.c ../core/j1939.c ../core/j1939_db.c ../core/measure.c

test: test_core
	./test_core

test_core: $(SRC) ../core/*.h
	$(CC) $(CFLAGS) -o $@ $(SRC) -lm

clean:
	rm -f test_core

.PHONY: test clean
