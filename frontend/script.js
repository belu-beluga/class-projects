function foo(){
    console.log("Hello, World!");
    setTimeout(() => {
        console.log("This is a delayed message.");
    }, 1000);
    return "Function executed";
}

foo();
