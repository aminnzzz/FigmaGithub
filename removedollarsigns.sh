#!/bin/bash


for f in tokens/*.json; 

do echo "Processing $f"; 
sed -i 's/\$//g' $f;

done

