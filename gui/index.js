(function(){
    let apiRequest=function(command){
        let url="/api/"+command;
        return new Promise(function(resolve,reject){
            fetch(url)
            .then(function(r){
                return r.json();
            })
            .then(function(data){
                if (! data.status || data.status !== 'OK'){
                    reject("status: "+data.status);
                    retturn;
                }
                resolve(data);
                return;
            })
            .catch(function(error){
                reject(error);
            });
        });
    }
    let fetchList=function(){
        let listFrame=document.getElementById('infoFrame');
        if (! listFrame) return;
        listFrame.innerHTML='';
        apiRequest('fetchList')
            .then(function(data){
                data.list.forEach(function(le){
                    let d=document.createElement('div');
                    d.classList.add('listElement');
                    d.textContent=le;
                })
            })
            .catch(function(error){
                alert("unable to fetch info: "+error);
            })
    }

    let showConsole=function(){
        let overlay=document.getElementById('responseOverlay');
        if (! overlay) return;
        overlay.style.visibility='unset';
        let content=overlay.querySelector('.overlayContent');
        content.textContent=''
        //open ws here
    }

    window.addEventListener('load',function(){
        let cb=document.getElementById('closeOverlay');
        if (cb){
            cb.addEventListener('click',function(){
                let ov=document.getElementById('responseOverlay');
                if (ov) ov.style.visibility='hidden';
            })
        }
        let actionButtons=['refresh','updateList','updatePackages','restart'];
        actionButtons.forEach(function(bt){
            let bel=document.getElementById(bt);
            if (bel){
                bel.addEventListener('click',function(ev){
                    let action=ev.target.getAttribute('data-action');
                    if (!action) return;
                    apiRequest(action)
                        .then(function(response){
                            if (action === 'reload'){
                                fetchList();
                            }
                            if (action === 'updateList' || action === 'updatePackages'){
                                showConsole();
                            }
                        })
                        .catch(function(error){
                            alert("Error: "+error);
                        })
                })
            }
        })
    })
})();